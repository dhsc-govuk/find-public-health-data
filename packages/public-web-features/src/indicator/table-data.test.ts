import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiCall,
  type FakeApiClient,
} from '@fphd/web-server/testing';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { loadIndicatorTableData } from './loader.ts';
import { indicatorDetail } from './view.testing.ts';

const localAuthorities = [
  {
    displayGroup: 'Local authorities',
    areas: Array.from({ length: 25 }, (_, index) => ({
      code: `E06${String(index).padStart(6, '0')}`,
      name: `Area ${index}`,
    })),
  },
];

function query(call: FakeApiCall) {
  return new URL(`http://localhost${call.path}`).searchParams;
}

function areaName(code: string) {
  return code === 'E92000001' ? 'England' : `Area ${code}`;
}

function api() {
  return createFakeApiClient({
    'GET /api/areas': localAuthorities,
    'GET /api/areas/lookup': (call) =>
      query(call)
        .getAll('areaCode')
        .map((code) => ({
          code,
          name: areaName(code),
          areaType: 'UA unchanged',
          displayGroup: 'Local authorities',
        })),
    'GET /api/indicator-data': (call) => {
      const params = query(call);
      return params
        .getAll('indicator')
        .map(Number)
        .map((shortId) => ({
          detail: indicatorDetail(shortId),
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
            areaName: areaName(code),
            observations: [],
          })),
        }));
    },
  });
}

function args(
  client: FakeApiClient,
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
    const client = api();
    const query = Array.from({ length: 15 }, (_, index) => `is=${index + 100}`).join('&');
    const result = await loadIndicatorTableData(
      args(client, `http://localhost/topics/diabetes?${query}`, ''),
      [],
    );
    expect(result.selected).toHaveLength(15);
  });

  it.each(['latestPerSeries', 'recentPerSeries', 'lastEightPeriodsPerSeries'] as const)(
    'loads whole area summary groups in API batches with %s history without truncating them to 19 areas',
    async (observationHistory) => {
      const client = api();
      const result = await loadIndicatorTableData(
        args(client, 'http://localhost/topics/a?is=108&als=Local+authorities', ''),
        ['Local authorities'],
        true,
        observationHistory,
      );
      expect(result.selected[0]?.areaData).toHaveLength(26);
      expect(Object.keys(result.selected[0]?.tableSeries?.[0]?.segments ?? {})).toHaveLength(26);
      expect(Object.keys(result.selected[0]?.tableSeries?.[0]?.trends ?? {})).toHaveLength(26);
      expect(result.selectedAreas).toHaveLength(25);
      expect(result.areasLimited).toBe(false);
      const dataCalls = client.calls.filter(({ path }) => path.startsWith('/api/indicator-data?'));
      const batches = dataCalls.map((call) => query(call).getAll('areaCode'));
      expect(batches.map((batch) => batch.length)).toEqual([20, 6]);
      expect(
        dataCalls.every(
          (call) =>
            query(call).get('observationHistory') ===
            (observationHistory === 'recentPerSeries' ? null : observationHistory),
        ),
      ).toBe(true);
    },
  );
});
