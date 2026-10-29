import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Logger } from '@fphd/logger';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { createBaseApp, serverLogging, startServer } from './index.ts';
import { request } from './testing.ts';

describe('createBaseApp', () => {
  it('answers both probes while it is serving normally', async () => {
    const app = createBaseApp({ serviceName: 'public-api' });

    const live = await request(app).get('/livez');
    const ready = await request(app).get('/readyz');

    expect(live.status).toBe(200);
    expect(ready.status).toBe(200);
    expect(live.body).toEqual({ status: 'ok', service: 'public-api' });
    expect(ready.body).toEqual({ status: 'ok', service: 'public-api' });
  });

  it('fails readiness while draining but stays alive, so the stop is not cut short', async () => {
    const app = createBaseApp({ serviceName: 'public-api' });
    app.locals.draining = true;

    const ready = await request(app).get('/readyz');
    const live = await request(app).get('/livez');

    expect(ready.status).toBe(503);
    expect(ready.body).toEqual({ status: 'draining', service: 'public-api' });
    expect(live.status).toBe(200);
  });

  it('names the app that answered, where four sit behind one front door', async () => {
    const app = createBaseApp({ serviceName: 'internal-web' });

    expect((await request(app).get('/livez')).body.service).toBe('internal-web');
  });

  it('does not advertise the framework', async () => {
    const app = createBaseApp({ serviceName: 'public-api' });

    expect((await request(app).get('/livez')).headers['x-powered-by']).toBeUndefined();
  });

  it('sends the headers that carry no policy decision, on every response', async () => {
    const app = createBaseApp({ serviceName: 'public-api' });
    app.get('/anything', (_request, response) => response.json({}));

    const response = await request(app).get('/anything');

    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  // CSP and X-Frame-Options need an HTML document to mean anything, so they are the web
  // server's own and an API must not be given them here.
  it('leaves the document-only headers to whatever serves documents', async () => {
    const app = createBaseApp({ serviceName: 'public-api' });

    const response = await request(app).get('/livez');

    expect(response.headers['content-security-policy']).toBeUndefined();
    expect(response.headers['x-frame-options']).toBeUndefined();
  });
});

describe('startServer', () => {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  const opened: Server[] = [];
  let signalListeners: Map<NodeJS.Signals, unknown[]>;
  let exit: MockInstance<typeof process.exit>;

  function stubLogger() {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() } as unknown as Logger;
  }

  function start(logger: Logger, port: number): Server {
    const server = startServer({
      app: createBaseApp({ serviceName: 'public-api' }),
      host: '127.0.0.1',
      port,
      shutdown: { gracePeriodMs: 1_000, drainDelayMs: 0 },
      ...serverLogging(logger, { port }),
    });
    opened.push(server);
    return server;
  }

  beforeEach(() => {
    signalListeners = new Map(signals.map((signal) => [signal, process.listeners(signal)]));
    exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(async () => {
    exit.mockRestore();
    // startServer installs signal handlers on the test process; take them off again.
    for (const signal of signals) {
      for (const listener of process.listeners(signal)) {
        if (!signalListeners.get(signal)?.includes(listener)) process.off(signal, listener);
      }
    }
    await Promise.all(
      opened
        .splice(0)
        .filter((server) => server.listening)
        .map((server) => new Promise((resolve) => server.close(resolve))),
    );
  });

  it('logs Listening once bound, and leaves the process running', async () => {
    const logger = stubLogger();

    const server = start(logger, 0);
    await vi.waitFor(() => expect(logger.info).toHaveBeenCalledWith({ port: 0 }, 'Listening'));

    expect(server.listening).toBe(true);
    expect(exit).not.toHaveBeenCalled();
  });

  it('logs fatal and exits 1 when the port is taken, never claiming to listen', async () => {
    const occupant = createServer();
    opened.push(occupant);
    await new Promise<void>((resolve) => occupant.listen(0, '127.0.0.1', resolve));
    const { port } = occupant.address() as AddressInfo;
    const logger = stubLogger();

    start(logger, port);
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));

    expect(logger.fatal).toHaveBeenCalledWith(
      { err: expect.objectContaining({ code: 'EADDRINUSE' }), port },
      'Could not listen',
    );
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'Listening');
  });
});
