import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { loadIndicatorSearch } from './search-loader.ts';

function loaderArgs(get: ReturnType<typeof vi.fn>, url: string): LoaderFunctionArgs {
  const context = new RouterContextProvider();
  context.set(apiContext, { get } as unknown as ApiClient);
  return { context, params: {}, request: new Request(url) } as unknown as LoaderFunctionArgs;
}

describe('indicator search loader', () => {
  it('answers an empty query with no results and no api call', async () => {
    const get = vi.fn();

    const response = await loadIndicatorSearch(
      loaderArgs(get, 'http://localhost/indicators/search?q=+'),
    );

    expect(await response.json()).toEqual({ indicators: [] });
    expect(get).not.toHaveBeenCalled();
  });

  it('answers a query of control characters alone with no results and no api call', async () => {
    const get = vi.fn();

    const response = await loadIndicatorSearch(
      loaderArgs(get, 'http://localhost/indicators/search?q=%00'),
    );

    expect(await response.json()).toEqual({ indicators: [] });
    expect(get).not.toHaveBeenCalled();
  });

  it.each(['%09', '%00'])(
    'sends a query holding %s as words separated by a space',
    async (character) => {
      const get = vi.fn().mockResolvedValue({ indicators: [] });

      await loadIndicatorSearch(
        loaderArgs(get, `http://localhost/indicators/search?q=blood${character}pressure`),
      );

      expect(get).toHaveBeenCalledWith('/api/indicators?q=blood%20pressure', expect.anything());
    },
  );

  it('passes the query through to the api, encoded', async () => {
    const indicators = [
      { shortId: 241, slug: 'diabetes-qof-prevalence', name: 'Diabetes: QOF prevalence' },
    ];
    const get = vi.fn().mockResolvedValue({ indicators });

    const response = await loadIndicatorSearch(
      loaderArgs(get, 'http://localhost/indicators/search?q=diabetes+%26+obesity'),
    );

    expect(get).toHaveBeenCalledWith(
      '/api/indicators?q=diabetes%20%26%20obesity',
      expect.anything(),
    );
    expect(await response.json()).toEqual({ indicators });
  });

  it('uses the API query length limit', async () => {
    const get = vi.fn().mockResolvedValue({ indicators: [] });
    await loadIndicatorSearch(
      loaderArgs(get, `http://localhost/indicators/search?q=${'a'.repeat(300)}`),
    );

    expect(get).toHaveBeenCalledWith(`/api/indicators?q=${'a'.repeat(200)}`, expect.anything());
  });
});
