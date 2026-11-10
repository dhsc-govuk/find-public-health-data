import { EventEmitter } from 'node:events';

import { createJwtSessionService } from '@fphd/auth/jwt-session';
import { request } from '@fphd/express/testing';
import express, { type Request, type Response } from 'express';
import { type RouterContextProvider, redirect } from 'react-router';
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
import { createReactRouterApp, type ReactRouterBuildLoader } from './react-router-app.ts';

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

  it('needs no session to build the load context, for an app nobody signs in to', () => {
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

    describe("React Router's action origin check", () => {
      const action = vi.fn(() => redirect('/manage/topics'));

      /**
       * A server build with one route, whose action redirects, so an accepted POST answers 302
       * without rendering a page. Only the fields React Router reads for that request are set.
       */
      const build = {
        allowedActionOrigins: undefined,
        assets: { entry: { imports: [], module: '' }, routes: {}, url: '', version: '' },
        basename: undefined,
        entry: { module: { default: () => new Response(null, { status: 500 }) } },
        future: {},
        isSpaMode: false,
        prerender: [],
        publicPath: '/',
        routeDiscovery: { mode: 'initial' },
        routes: {
          root: { id: 'root', path: '', module: { default: () => null } },
          topics: {
            id: 'topics',
            parentId: 'root',
            path: 'manage/topics',
            module: { action, default: () => null },
          },
        },
        ssr: true,
        unstable_getCriticalCss: undefined,
      } as unknown as Awaited<ReturnType<ReactRouterBuildLoader>>;

      /**
       * Posts a form to the app with the real React Router request handler in place of the
       * mock above, mounted in a plain host app as the production host mounts it.
       *
       * The Host header is the container app's own name with no port, as the ingress passes it
       * on. React Router takes the port of the address it checks from the Host header when the
       * forwarded host has none, so the test server's port there would fail every origin.
       */
      async function postFrom(origin: string) {
        vi.resetModules();
        vi.doUnmock('@react-router/express');
        const { createReactRouterApp: createUnmockedApp } = await import('./react-router-app.ts');
        const host = express();
        host.use(createUnmockedApp(async () => build, { trustedProxyHops: 2 }));
        action.mockClear();

        return request(host)
          .post('/manage/topics')
          .set({
            ...forwardedHeaders,
            Host: 'internal-web.example.azurecontainerapps.io',
            Origin: origin,
          })
          .type('form')
          .send('title=Cancer');
      }

      it('accepts a form posted from the forwarded host', async () => {
        const response = await postFrom('https://example.azurefd.net');

        expect(response.status).toBe(302);
        expect(action).toHaveBeenCalledOnce();
      });

      it('refuses a form posted from another site', async () => {
        const response = await postFrom('https://another-site.example');

        expect(response.status).toBe(400);
        expect(action).not.toHaveBeenCalled();
      });
    });
  });
});
