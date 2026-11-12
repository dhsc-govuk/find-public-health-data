import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient, fails } from '@fphd/web-server/testing';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { loadGeography } from './geography-loader.ts';

function loaderArgs(api: FakeApiClient, url: string): LoaderFunctionArgs {
  const context = new RouterContextProvider();
  context.set(apiContext, api);
  return { context, params: {}, request: new Request(url) } as unknown as LoaderFunctionArgs;
}

describe('geography loader', () => {
  it('answers a level with its areas by display group', async () => {
    const api = createFakeApiClient({
      'GET /api/areas?displayGroup=Statistical%20regions&limit=101': [
        {
          displayGroup: 'Statistical regions',
          areas: [
            { code: 'E12000001', name: 'North East' },
            { code: 'E12000009', name: 'South West' },
          ],
        },
      ],
    });

    const response = await loadGeography(
      loaderArgs(api, 'http://localhost/geographies?level=Statistical%20regions'),
    );

    expect(await response.json()).toEqual({
      areas: [
        { code: 'E12000001', name: 'North East' },
        { code: 'E12000009', name: 'South West' },
      ],
    });
  });

  it('answers displayGroup requests with the same areas shape as level requests', async () => {
    const api = createFakeApiClient({
      'GET /api/indicators/indicator-108/areas': [
        { displayGroup: 'Statistical regions', areas: [{ code: 'E12000007', name: 'London' }] },
      ],
    });
    const response = await loadGeography(
      loaderArgs(
        api,
        'http://localhost/geographies?displayGroup=Statistical%20regions&indicator=indicator-108',
      ),
    );
    expect(await response.json()).toEqual({ areas: [{ code: 'E12000007', name: 'London' }] });
  });

  it('answers an unknown level with no areas', async () => {
    const api = createFakeApiClient({ 'GET /api/areas': [{ displayGroup: 'Nope', areas: [] }] });

    const response = await loadGeography(
      loaderArgs(api, 'http://localhost/geographies?level=Nope'),
    );

    expect(await response.json()).toEqual({ areas: [] });
  });

  it('groups search matches by their display group, dropping ungrouped areas', async () => {
    const api = createFakeApiClient({
      'GET /api/areas/search?q=west&limit=50': [
        {
          code: 'E06000052',
          name: 'Cornwall',
          areaType: 'UA unchanged',
          displayGroup: 'Local authorities',
        },
        {
          code: 'E12000009',
          name: 'South West',
          areaType: 'Regions (statistical)',
          displayGroup: 'Statistical regions',
        },
        { code: 'E92000001', name: 'England', areaType: 'England', displayGroup: null },
      ],
    });

    const response = await loadGeography(loaderArgs(api, 'http://localhost/geographies?q=west'));

    expect(await response.json()).toEqual({
      groups: [
        { name: 'Local authorities', areas: [{ code: 'E06000052', name: 'Cornwall' }] },
        { name: 'Statistical regions', areas: [{ code: 'E12000009', name: 'South West' }] },
      ],
    });
  });

  it('answers an overlong level with no areas and no api call', async () => {
    const api = createFakeApiClient();

    const response = await loadGeography(
      loaderArgs(api, `http://localhost/geographies?level=${'a'.repeat(101)}`),
    );

    expect(await response.json()).toEqual({ areas: [] });
    expect(api.calls).toEqual([]);
  });

  it('answers an empty query with no groups and no api call', async () => {
    const api = createFakeApiClient();

    const response = await loadGeography(loaderArgs(api, 'http://localhost/geographies?q=++'));

    expect(await response.json()).toEqual({ groups: [] });
    expect(api.calls).toEqual([]);
  });

  it('bounds geography searches to the same length as the page form', async () => {
    const api = createFakeApiClient({
      [`GET /api/areas/search?q=${'a'.repeat(100)}&limit=50`]: [],
    });
    await loadGeography(loaderArgs(api, `http://localhost/geographies?q=++${'a'.repeat(101)}++`));
    expect(api.calls).toHaveLength(1);
  });

  it('propagates failures so the picker can offer a retry', async () => {
    const failure = new Response(null, { status: 502 });
    const api = createFakeApiClient({ 'GET /api/areas/search': fails(failure) });
    await expect(
      loadGeography(loaderArgs(api, 'http://localhost/geographies?q=Cornwall')),
    ).rejects.toBe(failure);
  });
});
