import { request } from '@fphd/express/testing';
import express from 'express';
import { redirect } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { createReactRouterApp, type ReactRouterBuildLoader } from './react-router-app.ts';

// These tests use the real React Router request handler, so they live apart from
// react-router-app.test.ts, which mocks it.
describe("React Router's action origin check behind Front Door and Container Apps ingress", () => {
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
   * Posts a form to the app, mounted in a plain host app as the production host mounts it.
   *
   * The Host header is the container app's own name with no port, as the ingress passes it on.
   * React Router takes the port of the address it checks from the Host header when the forwarded
   * host has none, so the test server's port there would fail every origin.
   */
  function postFrom(origin: string) {
    const host = express();
    host.use(createReactRouterApp(async () => build, { trustedProxyHops: 2 }));
    action.mockClear();

    return request(host)
      .post('/manage/topics')
      .set({
        'X-Forwarded-Host': 'example.azurefd.net',
        'X-Forwarded-Proto': 'https',
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
