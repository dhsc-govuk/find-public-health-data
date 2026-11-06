import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { loadIndicatorTableData } from './loader.ts';

function api() {
  const get = vi.fn(async (path: string) => {
    if (/\/api\/indicators\/[^/]+\/areas\?/.test(path))
      return [
        {
          displayGroup: 'Local authorities',
          areas: Array.from({ length: 25 }, (_, index) => ({
            code: `E06${String(index).padStart(6, '0')}`,
            name: `Area ${index}`,
          })),
        },
      ];
    if (path.startsWith('/api/indicators?q='))
      return { indicators: [{ shortId: 241, name: 'Diabetes prevalence', slug: 'indicator-241' }] };
    if (path === '/api/areas/display-groups') return ['Local authorities', 'NHS regions'];
    if (path.startsWith('/api/areas/lookup'))
      return new URL(`http://localhost${path}`).searchParams.getAll('areaCode').map((code) => ({
        code,
        name: `Area ${code}`,
        areaType: 'UA unchanged',
        displayGroup: 'Local authorities',
      }));
    if (path.startsWith('/api/areas/parents')) return [];
    if (path.startsWith('/api/areas?displayGroup='))
      return [
        {
          displayGroup: 'Local authorities',
          areas: Array.from({ length: 25 }, (_, index) => ({
            code: `E06${String(index).padStart(6, '0')}`,
            name: `Area ${index}`,
          })),
        },
      ];
    if (path.startsWith('/api/areas')) return [{ areaType: 'England', areas: [] }];
    if (path.startsWith('/api/indicator-data?')) {
      const params = new URL(`http://localhost${path}`).searchParams;
      return params
        .getAll('indicator')
        .map(Number)
        .map((shortId) => ({
          detail: { shortId, slug: `indicator-${shortId}`, areaTypes: [] },
          tableSeries: [
            {
              sex: '',
              periodType: 'all',
              segments: Object.fromEntries(
                params.getAll('areaCode').map((code) => [code, 'Age:All ages']),
              ),
              trends: Object.fromEntries(params.getAll('areaCode').map((code) => [code, 'up'])),
            },
          ],
          areaData: params.getAll('areaCode').map((code) => ({
            areaCode: code,
            areaName: code === 'E92000001' ? 'England' : `Area ${code}`,
            observations: [],
          })),
        }));
    }
    if (path.includes('/data?'))
      return new URL(`http://localhost${path}`).searchParams.getAll('areaCode').map((code) => ({
        areaCode: code,
        areaName: code === 'E92000001' ? 'England' : `Area ${code}`,
        observations: [],
      }));
    if (path.includes('/range?')) return { periods: [] };
    const shortId = Number((path.split('/')[3] ?? '').replace('indicator-', ''));
    return { shortId, slug: `indicator-${shortId}`, areaTypes: [] };
  });
  return { client: { get } as unknown as ApiClient, get };
}

function args(
  client: ApiClient,
  url = 'http://localhost/indicator/indicator-108',
  slug: string | undefined = 'indicator-108',
): LoaderFunctionArgs {
  const context = new RouterContextProvider();
  context.set(apiContext, client);
  return {
    context,
    params: slug ? { slug } : {},
    request: new Request(url),
  } as unknown as LoaderFunctionArgs;
}

describe('shared table data', () => {
  it('loads the complete topic table without the single-page comparison limit', async () => {
    const { client } = api();
    const query = Array.from({ length: 15 }, (_, index) => `is=${index + 100}`).join('&');
    const result = await loadIndicatorTableData(
      args(client, `http://localhost/topics/diabetes?${query}`, ''),
      [],
    );
    expect(result.selected).toHaveLength(15);
  });

  it('loads whole area summary groups in API batches without truncating them to 19 areas', async () => {
    const { client, get } = api();
    const result = await loadIndicatorTableData(
      args(client, 'http://localhost/topics/a?is=108&als=Local+authorities', ''),
      ['Local authorities'],
      true,
    );
    expect(result.selected[0]?.areaData).toHaveLength(26);
    expect(Object.keys(result.selected[0]?.tableSeries?.[0]?.segments ?? {})).toHaveLength(26);
    expect(Object.keys(result.selected[0]?.tableSeries?.[0]?.trends ?? {})).toHaveLength(26);
    expect(result.selectedAreas).toHaveLength(25);
    expect(result.areasLimited).toBe(false);
    const batches = get.mock.calls
      .map(([path]) => path)
      .filter((path) => path.startsWith('/api/indicator-data?'))
      .map((path) => new URL(`http://localhost${path}`).searchParams.getAll('areaCode'));
    expect(batches.map((batch) => batch.length)).toEqual([20, 6]);
    expect(
      get.mock.calls
        .filter(([path]) => path.startsWith('/api/indicator-data?'))
        .every(
          ([path]) => new URL(`http://localhost${path}`).searchParams.get('points') === 'latest',
        ),
    ).toBe(true);
  });
});
