import { EventEmitter } from 'node:events';

import { createJwtSessionService } from '@fphd/auth/jwt-session';
import { request } from '@fphd/express/testing';
import express, { type Request, type Response } from 'express';
import type { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

interface ForwardedView {
  hostname: string;
  ip: string | undefined;
  protocol: string;
}

const captured = vi.hoisted(() => ({
  getLoadContext: undefined as
    | ((request: Request, response: Response) => RouterContextProvider)
    | undefined,
  forwarded: undefined as ForwardedView | undefined,
}));

vi.mock('@react-router/express', () => ({
  createRequestHandler: (options: {
    getLoadContext: (request: Request, response: Response) => RouterContextProvider;
  }) => {
    captured.getLoadContext = options.getLoadContext;
    // Read inside the handler: once the mounted app returns, the request reverts to the host's
    // prototype and these getters would answer for the host's settings instead.
    return (incoming: Request, _response: Response, next: () => void) => {
      captured.forwarded = {
        hostname: incoming.hostname,
        ip: incoming.ip,
        protocol: incoming.protocol,
      };
      next();
    };
  },
}));

import { loggerContext } from './logger-context.ts';
import { nonceContext } from './nonce-context.ts';
import { createReactRouterApp } from './react-router-app.ts';

const session = createJwtSessionService({
  audience: 'fphd-internal',
  cookieName: 'fphd-internal-session',
  issuer: 'fphd-auth',
  secret: 'a-jwt-session-secret-that-is-long-enough-for-tests',
  secure: false,
});

const logger = { name: 'test-web' };

/** An Express response as far as the load context reads it: its locals and its events. */
function fakeResponse(nonce: string) {
  return Object.assign(new EventEmitter(), { locals: { logger, nonce } });
}

function loadContext(nonce: string, response = fakeResponse(nonce)) {
  const context = captured.getLoadContext?.({} as Request, response as unknown as Response);

  if (context === undefined) {
    throw new Error('Expected getLoadContext to have been captured');
  }

  return context;
}

describe('createReactRouterApp', () => {
  it('does not advertise Express via x-powered-by on document responses', () => {
    const app = createReactRouterApp(
      () => {
        throw new Error('build should not load while asserting app settings');
      },
      { session, trustedProxyHops: 2 },
    );

    expect(app.disabled('x-powered-by')).toBe(true);
  });

  it('sets the nonce on the load context when no extendContext is given', () => {
    createReactRouterApp(
      () => {
        throw new Error('build should not load while asserting context wiring');
      },
      { session, trustedProxyHops: 2 },
    );

    expect(loadContext('test-nonce').get(nonceContext)).toBe('test-nonce');
  });

  it('builds the load context without a session for an app nobody signs in to', () => {
    createReactRouterApp(
      () => {
        throw new Error('build should not load while asserting context wiring');
      },
      { trustedProxyHops: 2 },
    );

    expect(loadContext('test-nonce').get(nonceContext)).toBe('test-nonce');
  });

  it('passes the logger on from the host, so the server entry can report failures through it', () => {
    createReactRouterApp(
      () => {
        throw new Error('build should not load while asserting context wiring');
      },
      { session, trustedProxyHops: 2 },
    );

    expect(loadContext('test-nonce').get(loggerContext)).toBe(logger);
  });

  it('runs extendContext after the nonce has been set, so it can add further values', () => {
    createReactRouterApp(
      () => {
        throw new Error('build should not load while asserting context wiring');
      },
      {
        session,
        trustedProxyHops: 2,
        extendContext: (context) => {
          context.set(nonceContext, `${context.get(nonceContext)}-extended`);
        },
      },
    );

    expect(loadContext('test-nonce').get(nonceContext)).toBe('test-nonce-extended');
  });

  describe("extendContext's signal", () => {
    function signalFor(response: ReturnType<typeof fakeResponse>) {
      let signal: AbortSignal | undefined;
      createReactRouterApp(
        () => {
          throw new Error('build should not load while asserting context wiring');
        },
        {
          session,
          trustedProxyHops: 2,
          extendContext: (_context, _request, given) => {
            signal = given;
          },
        },
      );
      loadContext('test-nonce', response);

      if (signal === undefined) throw new Error('Expected extendContext to have been called');
      return signal;
    }

    it('aborts when the response closes before it finishes, as when the browser leaves', () => {
      const response = fakeResponse('test-nonce');
      const signal = signalFor(response);

      response.emit('close');

      expect(signal.aborted).toBe(true);
    });

    it('does not abort when the response closes after it finished', () => {
      const response = fakeResponse('test-nonce');
      const signal = signalFor(response);

      response.emit('finish');
      response.emit('close');

      expect(signal.aborted).toBe(false);
    });
  });

  describe('behind Front Door and Container Apps ingress', () => {
    const forwardedHeaders = {
      'X-Forwarded-Host': 'example.azurefd.net',
      'X-Forwarded-Proto': 'https',
    };

    /** Mounted in a plain host app, as the production host mounts it. */
    async function forwardedView(
      headers: Record<string, string>,
      trustedProxyHops = 2,
    ): Promise<ForwardedView> {
      const host = express();
      host.use(
        createReactRouterApp(
          () => {
            throw new Error('build should not load while asserting forwarded headers');
          },
          { session, trustedProxyHops },
        ),
      );
      host.use((_request, response) => {
        response.sendStatus(204);
      });
      captured.forwarded = undefined;

      await request(host).post('/manage/topics').set(headers).expect(204);

      if (captured.forwarded === undefined) {
        throw new Error('Expected the request handler to have seen the request');
      }

      return captured.forwarded;
    }

    it('sees the forwarded host and protocol, so actions pass the origin check', async () => {
      const view = await forwardedView(forwardedHeaders);

      expect(view).toMatchObject({ hostname: 'example.azurefd.net', protocol: 'https' });
    });

    it('takes the client address from behind two hops', async () => {
      const view = await forwardedView({
        ...forwardedHeaders,
        'X-Forwarded-For': '203.0.113.5, 198.51.100.7',
      });

      expect(view.ip).toBe('203.0.113.5');
    });

    it('trusts no further hop than Front Door for the client address', async () => {
      const view = await forwardedView({
        ...forwardedHeaders,
        'X-Forwarded-For': '192.0.2.9, 203.0.113.5, 198.51.100.7',
      });

      expect(view.ip).toBe('203.0.113.5');
    });

    it('ignores the forwarded headers with no trusted hops', async () => {
      const view = await forwardedView(
        { ...forwardedHeaders, 'X-Forwarded-For': '203.0.113.5' },
        0,
      );

      expect(view).toMatchObject({ hostname: '127.0.0.1', protocol: 'http' });
      expect(view.ip).not.toBe('203.0.113.5');
    });
  });
});
