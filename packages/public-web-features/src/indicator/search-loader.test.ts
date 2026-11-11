import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient } from '@fphd/web-server/testing';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { loadIndicatorSearch } from './search-loader.ts';

function loaderArgs(api: FakeApiClient, url: string): LoaderFunctionArgs {
  const context = new RouterContextProvider();
  context.set(apiContext, api);
  return { context, params: {}, request: new Request(url) } as unknown as LoaderFunctionArgs;
}

describe('indicator search loader', () => {
  it('answers an empty query with no results and no api call', async () => {
    const api = createFakeApiClient();

    const response = await loadIndicatorSearch(
      loaderArgs(api, 'http://localhost/indicators/search?q=+'),
    );

    expect(await response.json()).toEqual({ indicators: [] });
    expect(api.calls).toEqual([]);
  });

  it('answers a query of control characters alone with no results and no api call', async () => {
    const api = createFakeApiClient();

    const response = await loadIndicatorSearch(
      loaderArgs(api, 'http://localhost/indicators/search?q=%00'),
    );

    expect(await response.json()).toEqual({ indicators: [] });
    expect(api.calls).toEqual([]);
  });

  it.each(['%09', '%00'])(
    'sends a query holding %s as words separated by a space',
    async (character) => {
      const api = createFakeApiClient({
        'GET /api/indicators?q=blood%20pressure': { indicators: [] },
      });

      await loadIndicatorSearch(
        loaderArgs(api, `http://localhost/indicators/search?q=blood${character}pressure`),
      );

      expect(api.calls).toHaveLength(1);
    },
  );

  it('passes the query through to the api, encoded', async () => {
    const indicators = [
      { shortId: 241, slug: 'diabetes-qof-prevalence', name: 'Diabetes: QOF prevalence' },
    ];
    const api = createFakeApiClient({
      'GET /api/indicators?q=diabetes%20%26%20obesity': { indicators },
    });

    const response = await loadIndicatorSearch(
      loaderArgs(api, 'http://localhost/indicators/search?q=diabetes+%26+obesity'),
    );

    expect(await response.json()).toEqual({ indicators });
  });

  it('uses the API query length limit', async () => {
    const api = createFakeApiClient({
      [`GET /api/indicators?q=${'a'.repeat(200)}`]: { indicators: [] },
    });
    await loadIndicatorSearch(
      loaderArgs(api, `http://localhost/indicators/search?q=${'a'.repeat(300)}`),
    );

    expect(api.calls).toHaveLength(1);
  });
});
