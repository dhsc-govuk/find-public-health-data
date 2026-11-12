import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from '@fphd/express/testing';
import { createLogger, type Logger } from '@fphd/logger';
import {
  createRequestHandler,
  type LoaderFunction,
  Outlet,
  RouterContextProvider,
  Scripts,
  type ServerBuild,
  useLoaderData,
} from 'react-router';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { DataSection } from '../../public-web-features/src/data-section.tsx';
import handleRequest, { handleError, streamTimeout } from './entry-server.tsx';
import { createProductionHost } from './host.ts';
import { loggerContext } from './logger-context.ts';
import { nonceContext } from './nonce-context.ts';
import { createReactRouterApp } from './react-router-app.ts';

const clientDirectory = mkdtempSync(join(tmpdir(), 'fphd-document-response-'));
afterAll(() => rmSync(clientDirectory, { force: true, recursive: true }));

function Document() {
  return (
    <html lang="en">
      <head>
        <title>Sections</title>
      </head>
      <body>
        <h1>Page shell</h1>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

function Sections() {
  const { section } = useLoaderData<{ section: string | Promise<string> }>();
  return (
    <>
      <p>Ready section</p>
      <DataSection label="Data" resolve={section}>
        {(value) => <p>{value}</p>}
      </DataSection>
    </>
  );
}

function app(loader: LoaderFunction, root = Document) {
  const entry = vi.fn(handleRequest);
  const logger = { error: vi.fn() };
  const context = new RouterContextProvider();
  context.set(nonceContext, 'test-nonce');
  context.set(loggerContext, logger as unknown as Logger);
  const build = {
    assets: {
      entry: { imports: [], module: '/entry.client.js' },
      routes: {
        root: { id: 'root', path: '', module: '/root.js', hasErrorBoundary: true },
        sections: {
          id: 'sections',
          parentId: 'root',
          path: 'sections',
          module: '/sections.js',
          hasLoader: true,
        },
      },
      url: '',
      version: '',
    },
    entry: { module: { default: entry, handleError, streamTimeout } },
    future: {},
    isSpaMode: false,
    prerender: [],
    publicPath: '/',
    routeDiscovery: { mode: 'initial' },
    routes: {
      root: {
        id: 'root',
        path: '',
        module: {
          default: root,
          ErrorBoundary: () => (
            <html lang="en">
              <body>Shell failed</body>
            </html>
          ),
        },
      },
      sections: {
        id: 'sections',
        parentId: 'root',
        path: 'sections',
        module: { default: Sections, loader },
      },
    },
    ssr: true,
  } as unknown as ServerBuild;
  const handler = createRequestHandler(build, 'development');
  return {
    build,
    entry,
    logger,
    request: (path = '/sections?view=table') =>
      handler(new Request(`https://example.com${path}`), context),
  };
}

afterEach(() => vi.useRealTimers());

describe('real React Router document and data responses', () => {
  it.each([false, true])(
    'inlines large completed sections through the production host (promise: %s)',
    async (deferred) => {
      const content = 'Complete table row '.repeat(2_000);
      const { build, entry } = app(() => ({
        section: deferred ? Promise.resolve(content) : content,
      }));
      const host = createProductionHost({
        clientDirectory,
        logger: createLogger({ name: 'test-web', level: 'silent' }),
        requestHandler: createReactRouterApp(async () => build, { trustedProxyHops: 0 }),
        serviceName: 'test-web',
      });

      const response = await httpRequest(host).get('/sections?view=table').expect(200);

      expect(entry).toHaveBeenCalledOnce();
      expect(response.text).toContain(content);
      expect(response.text).not.toContain('<!--$?-->');
      expect(response.text).not.toContain('<template');
      expect(response.text).not.toContain('Try again');
      expect(response.text).not.toMatch(/<div hidden id="S:/);
    },
  );

  it('streams .data before deferred data settles without calling the document entry', async () => {
    const section = Promise.withResolvers<string>();
    const { request, entry } = app(() => ({ section: section.promise }));
    const response = await request('/sections.data');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Expected a streaming response');
    try {
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/x-script');
      const first = await reader.read();
      expect(first.done).toBe(false);
      expect(new TextDecoder().decode(first.value)).toContain('section');
      const ready = vi.fn<() => void>();
      const next = reader.read().then((chunk) => {
        ready();
        return chunk;
      });
      await Promise.resolve();
      expect(ready).not.toHaveBeenCalled();
      section.resolve('Deferred table');
      const chunks = [(await next).value];
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        chunks.push(chunk.value);
      }
      expect(chunks.map((chunk) => new TextDecoder().decode(chunk)).join('')).toContain(
        'Deferred table',
      );
      expect(entry).not.toHaveBeenCalled();
    } finally {
      section.resolve('Deferred table');
      await reader.cancel();
    }
  });

  it('waits for deferred document content and sends it in the initial HTML', async () => {
    const section = Promise.withResolvers<string>();
    const { request, entry } = app(() => ({ section: section.promise }));
    const ready = vi.fn<() => void>();
    const pending = request().then((response) => {
      ready();
      return response;
    });
    await vi.waitFor(() => expect(entry).toHaveBeenCalledOnce());
    expect(ready).not.toHaveBeenCalled();
    section.resolve('Complete table');
    const response = await pending;
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('Complete table');
    expect(html).not.toContain('Try again');
    expect(html).not.toContain('Loading');
    expect(html).not.toContain('<template');
  });

  it('keeps the .data timeout independent of the document renderer', async () => {
    vi.useFakeTimers();
    const { request, entry } = app(() => ({ section: new Promise<string>(() => {}) }));
    const response = await request('/sections.data');
    const body = response.text();
    await vi.advanceTimersByTimeAsync(streamTimeout);
    expect(await body).toContain('Server Timeout');
    expect(response.status).toBe(200);
    expect(entry).not.toHaveBeenCalled();
  });

  it.each(['before rendering', 'during rendering'])(
    'returns 200 and retry HTML for a section rejected %s',
    async (when) => {
      const section = Promise.withResolvers<string>();
      void section.promise.catch(() => {});
      const { request, entry, logger } = app(() => ({ section: section.promise }));
      if (when === 'before rendering') section.reject(new Error('API unavailable'));
      const pending = request();
      if (when === 'during rendering') {
        await vi.waitFor(() => expect(entry).toHaveBeenCalledOnce());
        section.reject(new Error('API unavailable'));
      }
      const response = await pending;
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain('Ready section');
      expect(html).toContain('Data<!-- --> could not be loaded.');
      expect(html).toContain('href="/sections?view=table"');
      expect(html).toContain('Try again');
      expect(html).not.toContain('Loading');
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it('returns the ready shell and retry links after the render deadline, including without JavaScript', async () => {
    vi.useFakeTimers();
    const { request, entry } = app(() => ({ section: new Promise<string>(() => {}) }));
    const ready = vi.fn<() => void>();
    const pending = request().then((response) => {
      ready();
      return response;
    });
    await vi.waitFor(() => expect(entry).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(streamTimeout);
    expect(ready).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    const response = await pending;
    const html = (await response.text()).split('<script')[0];
    expect(response.status).toBe(200);
    expect(html).toContain('Page shell');
    expect(html).toContain('Ready section');
    expect(html).toContain('Try again');
    expect(html).toContain('href="/sections?view=table"');
    expect(html).not.toContain('Loading');
  });

  it('starts the render deadline after a slow document loader has settled', async () => {
    vi.useFakeTimers();
    const { request, entry } = app(async () => {
      await new Promise((resolve) => setTimeout(resolve, 7_000));
      return { section: 'Slow complete table' };
    });
    const pending = request();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(entry).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    const response = await pending;
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('Slow complete table');
    expect(html).not.toContain('Try again');
    expect(html).not.toContain('Loading');
  });

  it('keeps a genuine shell rendering failure as a 500', async () => {
    const error = new Error('Shell rendering failed');
    const { request, logger } = app(
      () => ({ section: 'Table' }),
      () => {
        throw error;
      },
    );
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('Shell failed');
    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Request failed');
  });
});
