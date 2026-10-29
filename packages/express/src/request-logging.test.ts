import { createCapturingLogger } from '@fphd/logger/testing';
import express from 'express';
import { describe, expect, it } from 'vitest';

import { createBaseApp, requestAwareLogger, requestLogging } from './index.ts';
import { request } from './testing.ts';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function createApp(options?: Parameters<typeof requestLogging>[1]) {
  const { logger, lines } = createCapturingLogger('public-web');
  const app = createBaseApp({ serviceName: 'public-web' });
  app.use(requestLogging(logger, options));
  app.get('/topics', (_request, response) => response.json({}));
  app.get('/broken', (_request, response) => response.status(500).send('no'));
  app.use((_request, response) => response.status(404).send('missing'));

  return { app, lines };
}

async function settled(lines: unknown[]) {
  // The line is written on the response's 'finish' event, after supertest has resolved.
  await new Promise((resolve) => setImmediate(resolve));
  return lines;
}

describe('requestLogging', () => {
  it('writes one line per request, in the shape the rest of the log already has', async () => {
    const { app, lines } = createApp();

    await request(app).get('/topics?page=2');

    expect(await settled(lines)).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 30,
      name: 'public-web',
      req: { method: 'GET', url: '/topics?page=2' },
      res: { statusCode: 200 },
    });
    expect(lines[0]).toHaveProperty('time');
    expect(lines[0]?.responseTime).toBeTypeOf('number');
  });

  it('keeps headers out of the line, since the session cookie travels in one', async () => {
    const { app, lines } = createApp();

    await request(app).get('/topics').set('Cookie', 'session=secret');
    await settled(lines);

    expect(JSON.stringify(lines[0])).not.toContain('secret');
    expect(lines[0]?.req).toEqual({ id: expect.any(String), method: 'GET', url: '/topics' });
    expect(lines[0]?.res).toEqual({ statusCode: 200 });
  });

  it('gives every request its own id', async () => {
    const { app, lines } = createApp();

    await request(app).get('/topics');
    await request(app).get('/topics');
    await settled(lines);

    const ids = lines.map((line) => (line.req as { id: string }).id);
    expect(ids[0]).toMatch(UUID_V7);
    expect(ids[1]).toMatch(UUID_V7);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('returns the id to the caller, so a tester can find their own lines', async () => {
    const { app, lines } = createApp();

    const response = await request(app).get('/topics');
    await settled(lines);

    expect(response.headers['x-fphd-request-id']).toMatch(UUID_V7);
    expect(lines[0]?.req).toMatchObject({ id: response.headers['x-fphd-request-id'] });
  });

  it('keeps a forwarded id when told to, so a web line and an API line read as one flow', async () => {
    const { app, lines } = createApp({ servesWebApps: true });

    await request(app)
      .get('/topics')
      .set('X-Fphd-Request-Id', '019924a1-2c40-7000-8000-000000000001');
    await settled(lines);

    expect(lines[0]?.req).toMatchObject({ id: '019924a1-2c40-7000-8000-000000000001' });
  });

  it('ignores a forwarded id by default, since a browser can send the header too', async () => {
    const { app, lines } = createApp();

    await request(app)
      .get('/topics')
      .set('X-Fphd-Request-Id', '019924a1-2c40-7000-8000-000000000001');
    await settled(lines);

    expect(lines[0]?.req).toMatchObject({ id: expect.stringMatching(UUID_V7) });
    expect(JSON.stringify(lines[0])).not.toContain('019924a1-2c40-7000-8000-000000000001');
  });

  it('mints its own id for a request Front Door relayed, since a web app never goes through it', async () => {
    const { app, lines } = createApp({ servesWebApps: true });

    await request(app)
      .get('/topics')
      .set('X-Azure-Ref', '0abc123==')
      .set('X-Fphd-Request-Id', '019924a1-2c40-7000-8000-000000000001');
    await settled(lines);

    expect(lines[0]?.req).toMatchObject({
      id: expect.stringMatching(UUID_V7),
      azureRef: '0abc123==',
    });
    expect(JSON.stringify(lines[0])).not.toContain('019924a1-2c40-7000-8000-000000000001');
  });

  it('replaces a forwarded id that is not a uuid, rather than log what a stranger chose', async () => {
    const { app, lines } = createApp({ servesWebApps: true });

    await request(app).get('/topics').set('X-Fphd-Request-Id', 'chosen-by-the-caller');
    await settled(lines);

    expect(lines[0]?.req).toMatchObject({ id: expect.stringMatching(UUID_V7) });
    expect(JSON.stringify(lines[0])).not.toContain('chosen-by-the-caller');
  });

  it("records Front Door's reference when it forwarded the request", async () => {
    const { app, lines } = createApp();

    await request(app).get('/topics').set('X-Azure-Ref', '0abc123==');
    await settled(lines);

    expect(lines[0]?.req).toMatchObject({ azureRef: '0abc123==' });
  });

  it('keeps every address out of the line, forwarded or not', async () => {
    const { app, lines } = createApp();

    await request(app).get('/topics').set('X-Forwarded-For', '203.0.113.5, 198.51.100.7');
    await settled(lines);

    expect(JSON.stringify(lines[0])).not.toMatch(/203\.0\.113\.5|198\.51\.100\.7|127\.0\.0\.1|::1/);
  });

  it("omits Front Door's reference when no proxy set it", async () => {
    const { app, lines } = createApp();

    await request(app).get('/topics');
    await settled(lines);

    expect(lines[0]?.req).not.toHaveProperty('azureRef');
  });

  it('marks a request from inside the environment as a web app call', async () => {
    const { app, lines } = createApp({ servesWebApps: true });

    await request(app).get('/topics');
    await settled(lines);

    expect(lines[0]?.req).toMatchObject({ source: 'web' });
  });

  it('marks a request Front Door relayed as external', async () => {
    const { app, lines } = createApp({ servesWebApps: true });

    await request(app).get('/topics').set('X-Azure-Ref', '0abc123==');
    await settled(lines);

    expect(lines[0]?.req).toMatchObject({ source: 'external' });
  });

  it('leaves the source off a web app line, where every request comes from outside', async () => {
    const { app, lines } = createApp();

    await request(app).get('/topics').set('X-Azure-Ref', '0abc123==');
    await settled(lines);

    expect(lines[0]?.req).not.toHaveProperty('source');
  });

  it('logs a server error response at error level, and a miss at info', async () => {
    const { app, lines } = createApp();

    await request(app).get('/broken');
    await request(app).get('/nowhere');
    await settled(lines);

    expect(lines[0]).not.toHaveProperty('err');

    expect(
      lines.map((line) => [line.level, (line.res as { statusCode: number }).statusCode]),
    ).toEqual([
      [50, 500],
      [30, 404],
    ]);
  });

  // Mounted ahead of the probes, unlike createBaseApp's, so the middleware sees them and the
  // ignore is what keeps the log empty.
  it.each(['/livez', '/readyz', '/readyz?full=1'])('skips the probe at %s', async (path) => {
    const { logger, lines } = createCapturingLogger('public-web');
    const app = express();
    app.use(requestLogging(logger));
    app.get(['/livez', '/readyz'], (_request, response) => response.json({}));

    await request(app).get(path);

    expect(await settled(lines)).toHaveLength(0);
  });

  it('uses the request path as express sees it, whatever router served it', async () => {
    const { logger, lines } = createCapturingLogger('public-web');
    const app = express();
    app.use(requestLogging(logger));
    app.use(
      '/api',
      express.Router().get('/topics', (_request, response) => response.json({})),
    );

    await request(app).get('/api/topics');
    await settled(lines);

    expect(lines[0]?.req).toMatchObject({ method: 'GET', url: '/api/topics' });
  });
});

describe('requestAwareLogger', () => {
  it("gives a handler's line the request line's id, under the same field and nothing more", async () => {
    const { logger, lines } = createCapturingLogger('public-web');
    const app = express();
    app.use(requestLogging(logger));
    app.get('/topics', (request, response) => {
      requestAwareLogger(logger, request).info({ count: 3 }, 'Topics loaded');
      response.json({});
    });

    await request(app).get('/topics?page=2').set('Cookie', 'session=secret');
    await settled(lines);

    const [handlerLine, requestLine] = lines as [{ req: { id: string } }, Record<string, unknown>];
    expect(handlerLine).toMatchObject({ count: 3, msg: 'Topics loaded' });
    expect(handlerLine.req).toEqual({ id: expect.stringMatching(UUID_V7) });
    expect(requestLine.req).toEqual({
      id: handlerLine.req.id,
      method: 'GET',
      url: '/topics?page=2',
    });
    expect(requestLine.res).toEqual({ statusCode: 200 });
    expect(JSON.stringify(handlerLine)).not.toContain('secret');
  });

  it('is the logger itself for a request the middleware never saw', async () => {
    const { logger, lines } = createCapturingLogger('public-web');
    let seen: unknown;
    const app = express();
    app.get('/topics', (request, response) => {
      seen = requestAwareLogger(logger, request);
      response.json({});
    });

    await request(app).get('/topics');

    expect(seen).toBe(logger);
    expect(await settled(lines)).toHaveLength(0);
  });
});
