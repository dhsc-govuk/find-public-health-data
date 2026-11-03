import { Agent, createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createShutdownHandler, phaseBudgets, type ShutdownOptions } from './shutdown.ts';

const defaults = { gracePeriodMs: 5_000, drainDelayMs: 0 };

/** Built before any traffic, as every entrypoint does: a socket that already exists is invisible
 * to the library. */
function shutdownHandler(server: Server, options: Partial<ShutdownOptions> = {}) {
  return createShutdownHandler(server, { ...defaults, onError: () => {}, ...options });
}

type Handler = Parameters<typeof createServer>[1];

let running: Server | undefined;

async function startServer(handler: Handler): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  running = server;

  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

/** `agent: false` forces a brand-new socket, so a refusal is the listener's and not a pooled
 * socket the server had already closed. */
function requestOnNewConnection(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { agent: false }, () => resolve());
    outgoing.on('error', reject);
    outgoing.end();
  });
}

/** A keep-alive socket the test owns, so it stays open and idle once the response has ended. */
function keepAliveRequest(url: string, agent: Agent): Promise<void> {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { agent }, (response) => {
      response.resume();
      response.on('end', () => resolve());
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(async () => {
  if (running?.listening === true) {
    running.closeAllConnections();
    await new Promise((resolve) => running?.close(resolve));
  }
  running = undefined;
});

describe('phaseBudgets', () => {
  it('leaves the close a window to work with when the drain would fill the budget', () => {
    const { drainMs, closeTimeoutMs } = phaseBudgets(600, 600);

    // A zero timeout is the library destroying every live request at once, so the drain gives way.
    expect(closeTimeoutMs).toBeGreaterThan(0);
    expect(drainMs).toBeLessThan(600);
  });

  it('fits all three phases inside the grace period', () => {
    for (const [gracePeriodMs, drainDelayMs] of [
      [25_000, 5_000],
      [5_000, 0],
      [1_000, 5_000],
      [600, 600],
    ] as const) {
      const { drainMs, closeMs, reserveMs } = phaseBudgets(gracePeriodMs, drainDelayMs);

      expect(drainMs + closeMs + reserveMs).toBeLessThanOrEqual(gracePeriodMs);
      expect(drainMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('asks the library to finish early, so its poll loop can slip and still be in time', () => {
    // Its 250ms hops each slip with the event loop, by seconds on a loaded process.
    const { closeMs, closeTimeoutMs } = phaseBudgets(25_000, 5_000);

    expect(closeTimeoutMs).toBeLessThan(closeMs);
    expect(closeMs - closeTimeoutMs).toBeGreaterThan(2_000);
  });

  it('shortens the reserve on a short grace period rather than spending the budget on it', () => {
    expect(phaseBudgets(25_000, 0).reserveMs).toBe(2_000);
    expect(phaseBudgets(1_000, 0).reserveMs).toBe(200);
  });
});

// The library's half, tested rather than trusted: a change of implementation would alter it.
describe('the close phase', () => {
  it('stops the server listening', async () => {
    const { server } = await startServer((_request, response) => response.end('ok'));

    await shutdownHandler(server)('SIGTERM');

    expect(server.listening).toBe(false);
  });

  it('lets an in-flight request finish before resolving', async () => {
    const reachedHandler = deferred();
    const releaseHandler = deferred();
    const { server, url } = await startServer(async (_request, response) => {
      reachedHandler.resolve();
      await releaseHandler.promise;
      response.end('finished');
    });
    const stop = shutdownHandler(server);

    const inFlight = fetch(`${url}/slow`);
    await reachedHandler.promise;

    const settled = vi.fn();
    const shutdown = stop('SIGTERM').then(settled);

    await delay(20);
    expect(settled).not.toHaveBeenCalled();

    releaseHandler.resolve();
    expect(await (await inFlight).text()).toBe('finished');
    await shutdown;
    expect(settled).toHaveBeenCalled();
  });

  it('refuses new connections while finishing the ones it has', async () => {
    const releaseHandler = deferred();
    const reachedHandler = deferred();
    const { server, url } = await startServer(async (_request, response) => {
      reachedHandler.resolve();
      await releaseHandler.promise;
      response.end('finished');
    });
    const stop = shutdownHandler(server);

    const settled = vi.fn();
    const inFlight = fetch(`${url}/slow`).finally(settled);
    await reachedHandler.promise;
    const shutdown = stop('SIGTERM');

    // Waited for, not raced: until the listener has closed, a connection being accepted proves
    // nothing.
    await vi.waitFor(() => expect(server.listening).toBe(false));
    await expect(requestOnNewConnection(`${url}/late`)).rejects.toThrow();

    // The half that makes it graceful.
    expect(settled).not.toHaveBeenCalled();

    releaseHandler.resolve();
    expect(await (await inFlight).text()).toBe('finished');
    await shutdown;
  });

  it('does not wait out the timeout for a connection that falls idle mid-shutdown', async () => {
    const reachedHandler = deferred();
    const releaseHandler = deferred();
    const { server, url } = await startServer(async (_request, response) => {
      reachedHandler.resolve();
      await releaseHandler.promise;
      response.end('finished');
    });
    const agent = new Agent({ keepAlive: true });
    const stop = shutdownHandler(server);

    // Busy when the shutdown starts and idle a moment later, so `close`'s single sweep misses it
    // and this waits out Node's five-second keep-alive timeout instead.
    const inFlight = keepAliveRequest(`${url}/slow`, agent);
    await reachedHandler.promise;

    const started = Date.now();
    const shutdown = stop('SIGTERM');
    releaseHandler.resolve();
    await inFlight;
    await shutdown;

    expect(Date.now() - started).toBeLessThan(1_000);
    agent.destroy();
  });

  it('destroys a connection still mid-request once the timeout expires', async () => {
    const reachedHandler = deferred();
    const { server, url } = await startServer(() => {
      // Never responds.
      reachedHandler.resolve();
    });

    const stop = shutdownHandler(server, { gracePeriodMs: 300 });

    const abandoned = fetch(`${url}/never`).catch((error: unknown) => error);
    await reachedHandler.promise;

    await stop('SIGTERM');

    expect(server.listening).toBe(false);
    expect(await abandoned).toBeInstanceOf(Error);
  });
});

describe('createShutdownHandler', () => {
  it('reports the signal and the budgets before it starts to drain', async () => {
    const { server } = await startServer((_request, response) => response.end('ok'));
    const events: string[] = [];
    const onStopping = vi.fn(() => events.push('stopping'));

    await shutdownHandler(server, {
      gracePeriodMs: 1_000,
      drainDelayMs: 20,
      onStopping,
      onDraining: () => events.push('draining'),
      onShutdown: () => {
        events.push('cleanup');
      },
    })('SIGTERM');

    const { drainMs, closeMs, reserveMs } = phaseBudgets(1_000, 20);
    expect(events).toEqual(['stopping', 'draining', 'cleanup']);
    expect(onStopping).toHaveBeenCalledWith('SIGTERM', {
      gracePeriodMs: 1_000,
      drainMs,
      closeMs,
      reserveMs,
    });
  });

  it('still stops when reporting the stop throws', async () => {
    const { server } = await startServer((_request, response) => response.end('ok'));
    const failure = new Error('logger threw');
    const onShutdown = vi.fn();
    const onError = vi.fn();

    const exitCode = await shutdownHandler(server, {
      onStopping: () => {
        throw failure;
      },
      onShutdown,
      onError,
    })('SIGTERM');

    expect(server.listening).toBe(false);
    expect(onShutdown).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(exitCode).toBe(1);
  });

  it('reports the stop once, however many signals arrive', async () => {
    const { server } = await startServer((_request, response) => response.end('ok'));
    const onStopping = vi.fn();
    const shutdown = shutdownHandler(server, { onStopping });

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(onStopping).toHaveBeenCalledTimes(1);
    expect(onStopping).toHaveBeenCalledWith('SIGTERM', expect.anything());
  });

  it('keeps serving while it drains, before anything stops listening', async () => {
    let served = 0;
    const { server, url } = await startServer((_request, response) => {
      served += 1;
      response.end('ok');
    });
    const shutdown = shutdownHandler(server, { drainDelayMs: 100 })('SIGTERM');

    expect(server.listening).toBe(true);
    expect(await (await fetch(`${url}/during`)).text()).toBe('ok');

    await shutdown;

    expect(served).toBe(1);
    expect(server.listening).toBe(false);
  });

  it('fails readiness as the drain starts, not once it is over', async () => {
    const { server } = await startServer((_request, response) => response.end('ok'));
    const listeningWhenDraining = deferred<boolean>();
    const shutdown = shutdownHandler(server, {
      drainDelayMs: 20,
      onDraining: () => listeningWhenDraining.resolve(server.listening),
    });

    expect(await shutdown('SIGTERM')).toBe(0);
    expect(await listeningWhenDraining.promise).toBe(true);
    expect(server.listening).toBe(false);
  });

  it('closes the server even when the readiness flip throws', async () => {
    const { server } = await startServer((_request, response) => response.end('ok'));
    const failure = new Error('readiness flip threw');
    const onShutdown = vi.fn();
    const onError = vi.fn();

    const exitCode = await shutdownHandler(server, {
      onDraining: () => {
        throw failure;
      },
      onShutdown,
      onError,
    })('SIGTERM');

    // A rejected `preShutdown` short-circuits the library before it closes anything.
    expect(server.listening).toBe(false);
    expect(onShutdown).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(failure);
    expect(exitCode).toBe(1);
  });

  it('runs onShutdown after the server has closed, and reports success', async () => {
    const closedWhenCalled = deferred<boolean>();
    const { server } = await startServer((_request, response) => response.end('ok'));
    const shutdown = shutdownHandler(server, {
      onShutdown: () => closedWhenCalled.resolve(server.listening === false),
    });

    expect(await shutdown('SIGTERM')).toBe(0);
    expect(await closedWhenCalled.promise).toBe(true);
  });

  it('passes the signal through to onShutdown', async () => {
    const { server } = await startServer((_request, response) => response.end('ok'));
    const onShutdown = vi.fn();

    await shutdownHandler(server, { onShutdown })('SIGINT');

    expect(onShutdown).toHaveBeenCalledWith('SIGINT');
  });

  it('reports failure when cleanup throws, rather than exiting as if it had worked', async () => {
    const { server } = await startServer((_request, response) => response.end('ok'));
    const failure = new Error('pool refused to close');
    const onError = vi.fn();
    const shutdown = shutdownHandler(server, {
      onShutdown: () => {
        throw failure;
      },
      onError,
    });

    expect(await shutdown('SIGTERM')).toBe(1);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it('still runs cleanup when the server itself fails to close', async () => {
    // Never listened, so `close` fails — a signal landing in the startup window, where the pool
    // still has to be released.
    const server = createServer();
    const onShutdown = vi.fn();
    const onError = vi.fn();

    const exitCode = await shutdownHandler(server, { onShutdown, onError })('SIGTERM');

    expect(exitCode).toBe(1);
    expect(onShutdown).toHaveBeenCalledWith('SIGTERM');
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ERR_SERVER_NOT_RUNNING' }),
    );
  });

  it('gives up on cleanup that never finishes, rather than ignoring the signal for good', async () => {
    const { server } = await startServer((_request, response) => response.end('ok'));
    const stuck = deferred();
    const onError = vi.fn();
    const shutdown = shutdownHandler(server, {
      onShutdown: () => stuck.promise,
      onError,
      gracePeriodMs: 50,
    });

    expect(await shutdown('SIGTERM')).toBe(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    stuck.resolve();
  });

  it('bounds a close that cannot finish, and still lets cleanup run', async () => {
    const reachedHandler = deferred();
    const { server, url } = await startServer(() => reachedHandler.resolve());
    const abandoned = fetch(`${url}/never`).catch((error: unknown) => error);
    await reachedHandler.promise;

    // Served before the handler was built, so the library never saw the socket and `close` waits
    // on a connection that never ends. Only the backstop ends this stop.
    const cleanedUp = vi.fn();
    const onForcedClose = vi.fn();
    const shutdown = shutdownHandler(server, {
      gracePeriodMs: 400,
      onForcedClose,
      onShutdown: async () => {
        await delay(50);
        cleanedUp();
      },
    });

    const started = Date.now();

    // Zero, not one: a loaded process reaches here on a stop that did nothing wrong, and a
    // non-zero exit on every busy stop reads as a crash.
    expect(await shutdown('SIGTERM')).toBe(0);
    expect(onForcedClose).toHaveBeenCalled();

    expect(Date.now() - started).toBeLessThan(2_000);
    // Cleanup keeps its reserve even though the close spent the whole budget.
    expect(cleanedUp).toHaveBeenCalled();
    expect(await abandoned).toBeInstanceOf(Error);
  });

  it('stays quiet about a forced close when everything finished in time', async () => {
    const { server } = await startServer((_request, response) => response.end('ok'));
    const onForcedClose = vi.fn();

    expect(await shutdownHandler(server, { onForcedClose })('SIGTERM')).toBe(0);
    expect(onForcedClose).not.toHaveBeenCalled();
  });

  it('fits the whole stop inside the grace period rather than one budget per phase', async () => {
    const reachedHandler = deferred();
    const { server, url } = await startServer(() => reachedHandler.resolve());
    const stuck = deferred();
    // Every phase overruns: a request that never finishes and cleanup that never settles.
    const shutdown = shutdownHandler(server, {
      gracePeriodMs: 400,
      drainDelayMs: 100,
      onShutdown: () => stuck.promise,
    });

    const abandoned = fetch(`${url}/never`).catch((error: unknown) => error);
    await reachedHandler.promise;
    const started = Date.now();

    expect(await shutdown('SIGTERM')).toBe(1);

    expect(Date.now() - started).toBeLessThan(900);
    expect(await abandoned).toBeInstanceOf(Error);
    stuck.resolve();
  });

  it('ignores a repeated signal instead of shutting down twice', async () => {
    const { server } = await startServer((_request, response) => response.end('ok'));
    const onShutdown = vi.fn();
    const shutdown = shutdownHandler(server, { onShutdown });

    const [first, second] = await Promise.all([shutdown('SIGTERM'), shutdown('SIGTERM')]);

    expect(first).toBe(0);
    expect(second).toBe(0);
    expect(onShutdown).toHaveBeenCalledTimes(1);
  });
});
