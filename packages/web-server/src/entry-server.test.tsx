import type { Logger } from '@fphd/logger';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { type EntryContext, RouterContextProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loggerContext } from './logger-context.ts';
import { nonceContext } from './nonce-context.ts';

const renderer = vi.hoisted(() => ({
  abort: vi.fn(),
  options: undefined as RenderToPipeableStreamOptions | undefined,
  pipe: vi.fn(),
}));

vi.mock('react-dom/server', () => ({
  renderToPipeableStream: vi.fn(
    (_children: unknown, options: RenderToPipeableStreamOptions | undefined) => {
      renderer.options = options;
      return { abort: renderer.abort, pipe: renderer.pipe };
    },
  ),
}));

import handleRequest, { handleError, streamTimeout } from './entry-server.tsx';

const entryContext = { isSpaMode: false } as EntryContext;
const logger = { error: vi.fn() };

function loadContextWithNonce() {
  const context = new RouterContextProvider();
  context.set(nonceContext, 'test-nonce');
  context.set(loggerContext, logger as unknown as Logger);
  return context;
}

function startRequest() {
  const response = handleRequest(
    new Request('https://example.com/'),
    200,
    new Headers(),
    entryContext,
    loadContextWithNonce(),
  );
  const onAllReady = renderer.options?.onAllReady;

  if (onAllReady === undefined) {
    throw new Error('Expected the renderer to provide onAllReady');
  }

  renderer.options?.onShellReady?.();
  onAllReady();
  return response;
}

describe('React Router server rendering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logger.error.mockReset();
    renderer.abort.mockReset();
    renderer.options = undefined;
    renderer.pipe.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { userAgent: '', isSpaMode: false },
    { userAgent: 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36', isSpaMode: false },
    { userAgent: 'Googlebot', isSpaMode: false },
    { userAgent: '', isSpaMode: true },
  ])('waits for every boundary with $userAgent and SPA mode $isSpaMode', async (options) => {
    const ready = vi.fn();
    const response = handleRequest(
      new Request('https://example.com/', { headers: { 'user-agent': options.userAgent } }),
      200,
      new Headers(),
      { ...entryContext, isSpaMode: options.isSpaMode },
      loadContextWithNonce(),
    ).then(ready);

    await Promise.resolve();
    renderer.options?.onShellReady?.();
    expect(ready).not.toHaveBeenCalled();
    expect(renderer.pipe).not.toHaveBeenCalled();

    renderer.options?.onShellReady?.();
    renderer.options?.onAllReady?.();
    await response;
    expect(ready).toHaveBeenCalledOnce();
    expect(renderer.pipe).toHaveBeenCalledOnce();
  });

  it('gives React the nonce so inline scripts satisfy the CSP', async () => {
    await startRequest();

    expect(renderer.options?.nonce).toBe('test-nonce');
  });

  it('clears the abort deadline when streaming finishes', async () => {
    renderer.pipe.mockImplementation((body: NodeJS.EventEmitter) => {
      body.emit('finish');
    });

    await startRequest();
    vi.advanceTimersByTime(streamTimeout + 1_000);

    expect(renderer.abort).not.toHaveBeenCalled();
  });

  it('keeps the abort deadline while streaming is still in progress', async () => {
    await startRequest();
    vi.advanceTimersByTime(streamTimeout + 1_000);

    expect(renderer.abort).toHaveBeenCalledOnce();
  });

  it('flushes an overdue document without turning its ready shell into a 500', async () => {
    renderer.abort.mockImplementation(() => {
      renderer.options?.onError?.(new Error('The render was aborted'), {});
      renderer.options?.onAllReady?.();
    });
    const response = handleRequest(
      new Request('https://example.com/'),
      200,
      new Headers(),
      entryContext,
      loadContextWithNonce(),
    );
    renderer.options?.onShellReady?.();

    vi.advanceTimersByTime(streamTimeout + 1_000);

    expect((await response).status).toBe(200);
    expect(renderer.abort).toHaveBeenCalledOnce();
    expect(renderer.pipe).toHaveBeenCalledOnce();
  });

  it('clears the abort deadline when the shell fails', async () => {
    const error = new Error('render failed');
    const response = handleRequest(
      new Request('https://example.com/'),
      200,
      new Headers(),
      entryContext,
      loadContextWithNonce(),
    );

    renderer.options?.onShellError?.(error);

    await expect(response).rejects.toBe(error);
    vi.advanceTimersByTime(streamTimeout + 1_000);
    expect(renderer.abort).not.toHaveBeenCalled();
  });

  it('reports a failure after the shell has gone out through the logger', async () => {
    await startRequest();
    const error = new Error('boundary failed');

    renderer.options?.onError?.(error, {});

    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Streaming failed');
  });

  it('does not report an abandoned response as a streaming failure', async () => {
    const controller = new AbortController();
    const response = handleRequest(
      new Request('https://example.com/', { signal: controller.signal }),
      200,
      new Headers(),
      entryContext,
      loadContextWithNonce(),
    );
    renderer.options?.onShellReady?.();
    renderer.options?.onAllReady?.();
    await response;
    controller.abort();
    renderer.options?.onError?.(new Error('destination closed'), {});
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('leaves a failure before the shell to onShellError, which React Router reports', () => {
    void handleRequest(
      new Request('https://example.com/'),
      200,
      new Headers(),
      entryContext,
      loadContextWithNonce(),
    );

    renderer.options?.onError?.(new Error('shell failed'), {});

    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('handleError', () => {
  beforeEach(() => {
    logger.error.mockReset();
  });

  function report(error: unknown, request = new Request('https://example.com/topics?page=2')) {
    handleError(error, { context: loadContextWithNonce(), params: {}, request });
  }

  it('logs the error through the logger, which carries the request id', () => {
    const error = new Error('loader failed');

    report(error);

    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Request failed');
  });

  it('unwraps the error React Router wraps in a response', () => {
    const cause = new Error('action failed');
    // The shape isRouteErrorResponse detects, with the field React Router adds for a real error.
    const wrapped = {
      status: 500,
      statusText: 'Internal Server Error',
      internal: false,
      data: null,
      error: cause,
    };

    report(wrapped);

    expect(logger.error.mock.calls[0]?.[0]).toMatchObject({ err: cause });
  });

  it('stays quiet when the client has gone away', () => {
    const controller = new AbortController();
    controller.abort();

    report(
      new Error('too late'),
      new Request('https://example.com/', { signal: controller.signal }),
    );

    expect(logger.error).not.toHaveBeenCalled();
  });
});
