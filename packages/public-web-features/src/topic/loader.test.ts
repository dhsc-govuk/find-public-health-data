import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { loadTopic, loadTopicPage, loadTopics } from './loader.ts';

function loaderArgs(
  api: ApiClient,
  params: Record<string, string> = {},
  query = '',
): LoaderFunctionArgs {
  const context = new RouterContextProvider();
  context.set(apiContext, api);

  return {
    context,
    params,
    request: new Request(`http://localhost/topics${query}`),
  } as unknown as LoaderFunctionArgs;
}

describe('loadTopics', () => {
  it('asks the api for the topic list and returns what the contract schema yields', async () => {
    const topics = [
      {
        slug: 'a-topic',
        title: 'A Topic',
        description: 'All about a topic.',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      },
    ];
    const get = vi.fn().mockResolvedValue(topics);

    const result = await loadTopics(loaderArgs({ get } as unknown as ApiClient));

    expect(get).toHaveBeenCalledWith('/api/topics', expect.anything());
    expect(result).toEqual(topics);
  });

  it('propagates the failure the client raises rather than returning a partial page', async () => {
    const get = vi.fn().mockRejectedValue(new Response('Bad Gateway', { status: 502 }));

    await expect(loadTopics(loaderArgs({ get } as unknown as ApiClient))).rejects.toBeInstanceOf(
      Response,
    );
  });
});

function topicApi(
  indicators: { shortId: number; name: string; slug: string }[] = [],
  highlightedIndicatorIds: number[] = [],
  unavailableIds: number[] = [],
) {
  return vi.fn(async (path: string) => {
    if (path.endsWith('/trends'))
      return {
        total: indicators.length,
        better: 0,
        worse: 0,
        unchanged: 0,
        increasing: 0,
        decreasing: 0,
        unavailable: indicators.length,
      };
    if (path.startsWith('/api/topics/'))
      return {
        slug: 'topic-a',
        title: 'Topic A',
        description: 'About topic A',
        content: { highlightedIndicatorIds },
      };
    if (path === '/api/areas/display-groups') return [];
    if (path.startsWith('/api/areas?')) return [];
    if (path === '/api/indicators/facets')
      return { topics: [], classifications: [], sources: [], valueTypes: [], yearTypes: [] };
    if (path.startsWith('/api/indicators/search?')) {
      const params = new URL(path, 'http://api').searchParams;
      const page = Number(params.get('page') ?? '1');
      const limit = params.has('page') ? Number(params.get('limit') ?? '10') : 200;
      return {
        total: indicators.length,
        limit,
        ...(params.has('page') ? { page } : {}),
        indicators: indicators.slice((page - 1) * limit, page * limit),
      };
    }
    if (
      /^\/api\/indicators\/\d+$/.test(path) &&
      unavailableIds.includes(Number(path.split('/').at(-1)))
    )
      throw new Response('Not Found', { status: 404 });
    if (/^\/api\/indicators\/\d+$/.test(path))
      return {
        shortId: Number(path.split('/').at(-1)),
        name: 'Indicator',
        slug: 'indicator',
        topics: [],
        unit: '%',
        yearType: null,
        polarity: null,
        dataUpdatedAt: null,
      };
    if (path.startsWith('/api/indicator-data?')) {
      return new URL(path, 'http://api').searchParams.getAll('indicator').map((id) => ({
        detail: {
          shortId: Number(id),
          name: 'Indicator',
          slug: 'indicator',
          topics: [],
          unit: '%',
          yearType: null,
          polarity: null,
          dataUpdatedAt: null,
        },
        areaData: [],
      }));
    }
    if (path.includes('/data?')) return [];
    throw new Error(`Unexpected API path: ${path}`);
  });
}

describe('loadTopic', () => {
  it.each(['data', 'areas'])(
    'keeps the active %s tab when normalising filter inputs',
    async (tab) => {
      const result = await loadTopicPage(
        loaderArgs(
          { get: topicApi() } as unknown as ApiClient,
          { slug: 'topic-a' },
          `?tab-topic=${tab}&src-add=`,
        ),
      ).catch((error: unknown) => error);
      if (!(result instanceof Response)) throw new Error('Expected a filter redirect');
      expect(result.status).toBe(302);
      expect(
        new URL(result.headers.get('Location') ?? '', 'http://localhost').searchParams.get(
          'tab-topic',
        ),
      ).toBe(tab);
    },
  );

  it.each(['overview', 'data', 'areas', 'publications'])(
    'preloads every page section once when opening %s',
    async (tab) => {
      const indicators = Array.from({ length: 8 }, (_, index) => ({
        shortId: index + 1,
        name: `Indicator ${index + 1}`,
        slug: `indicator-${index + 1}`,
      }));
      const get = topicApi(indicators);
      const page = await loadTopicPage(
        loaderArgs({ get } as unknown as ApiClient, { slug: 'topic-a' }, `?tab-topic=${tab}`),
      );
      expect(page.overview?.selected).toHaveLength(4);
      expect(page.content?.listing.indicators).toHaveLength(8);
      expect(page.areas?.listing.indicators).toHaveLength(8);
      expect(page.content?.data).not.toHaveProperty('selected');
      expect(page.areas?.data).not.toHaveProperty('selected');
      expect(get.mock.calls.filter(([path]) => path === '/api/topics/topic-a')).toHaveLength(1);
      expect(
        get.mock.calls.filter(([path]) => /^\/api\/indicators\/\d+(?:\/data\?)?$/.test(path)),
      ).toHaveLength(0);
      expect(
        get.mock.calls.filter(([path]) => path.startsWith('/api/indicator-data?')),
      ).toHaveLength(2);
    },
  );
  it.each(['?tab-topic=publications', '?tab-topic=invalid'])(
    'loads only the topic content for %s',
    async (query) => {
      const get = topicApi();
      const result = await loadTopic(
        loaderArgs({ get } as unknown as ApiClient, { slug: 'topic-a' }, query),
      );
      expect(result.content).toBeNull();
      expect(get).toHaveBeenCalledExactlyOnceWith('/api/topics/topic-a', expect.anything());
    },
  );

  it('loads the overview count and highlighted indicators from the topic API', async () => {
    const get = topicApi([
      { shortId: 241, name: 'Diabetes prevalence', slug: 'diabetes-prevalence' },
    ]);
    const result = await loadTopic(
      loaderArgs({ get } as unknown as ApiClient, { slug: 'topic-a' }),
    );
    expect(result.overview?.trends.total).toBe(1);
    expect(result.overview?.selected.map(({ detail }) => detail.shortId)).toEqual([241]);
    expect(get).toHaveBeenCalledWith('/api/topics/topic-a/trends', expect.anything());
  });

  it('loads editorial highlights even when they are outside the first search page', async () => {
    const get = topicApi(
      [{ shortId: 241, name: 'Diabetes prevalence', slug: 'diabetes-prevalence' }],
      [93995],
    );
    const result = await loadTopic(
      loaderArgs({ get } as unknown as ApiClient, { slug: 'topic-a' }),
    );
    expect(result.overview?.selected[0]?.detail.shortId).toBe(93995);
    expect(get).toHaveBeenCalledWith('/api/indicators/93995', expect.anything());
  });

  it('skips editorial highlights that are absent from this published dataset', async () => {
    const get = topicApi(
      [{ shortId: 241, name: 'Diabetes prevalence', slug: 'diabetes-prevalence' }],
      [93995],
      [93995],
    );
    const result = await loadTopic(
      loaderArgs({ get } as unknown as ApiClient, { slug: 'topic-a' }),
    );
    expect(result.overview?.selected.map(({ detail }) => detail.shortId)).toEqual([241]);
  });

  it('requests the topic by slug', async () => {
    const get = topicApi();

    await loadTopic(loaderArgs({ get } as unknown as ApiClient, { slug: 'topic-a' }));

    expect(get).toHaveBeenCalledWith('/api/topics/topic-a', expect.anything());
  });

  it.each([['../internal'], ['../../health']])(
    'escapes a slug of %s so it cannot traverse onto another api route',
    async (slug) => {
      const get = topicApi();

      await loadTopic(loaderArgs({ get } as unknown as ApiClient, { slug }));

      // The guarantee that matters: whatever the slug, the request stays under /api/topics/.
      expect(String(get.mock.calls[0]?.[0])).toMatch(/^\/api\/topics\/[^/]+$/);
    },
  );

  it('keeps the route topic as the only topic filter even with a forged query selection', async () => {
    const get = topicApi();
    await loadTopic(
      loaderArgs(
        { get } as unknown as ApiClient,
        { slug: 'topic-a' },
        '?tab-topic=data&t=another-topic&is=999',
      ),
    );
    expect(get).toHaveBeenCalledWith(
      '/api/indicators/search?t=topic-a&sort=subtopic-asc',
      expect.anything(),
    );
    expect(get.mock.calls.some(([path]) => path === '/api/indicators/999')).toBe(false);
  });

  it('loads the complete topic list even when an old link includes a page parameter', async () => {
    const indicators = Array.from({ length: 12 }, (_, index) => ({
      shortId: index + 1,
      name: `Indicator ${String(index + 1).padStart(2, '0')}`,
      slug: `indicator-${index + 1}`,
    }));
    const get = topicApi(indicators);
    const result = await loadTopic(
      loaderArgs({ get } as unknown as ApiClient, { slug: 'topic-a' }, '?tab-topic=data&page=2'),
    );
    expect(result.content?.listing.indicators.map(({ shortId }) => shortId)).toEqual(
      indicators.map(({ shortId }) => shortId),
    );
    expect(result.content?.data.selected.map(({ detail }) => detail.shortId)).toEqual(
      indicators.map(({ shortId }) => shortId),
    );
    expect(
      get.mock.calls.some(
        ([path]) =>
          path.startsWith('/api/indicator-data?') &&
          new URL(path, 'http://api').searchParams.getAll('indicator').includes('1'),
      ),
    ).toBe(true);
  });

  it.each(['data', 'areas'])(
    'loads every result beyond the first bounded API page for %s',
    async (tab) => {
      const indicators = Array.from({ length: 405 }, (_, i) => ({
        shortId: i + 1,
        name: `Indicator ${i + 1}`,
        slug: `indicator-${i + 1}`,
      }));
      const get = topicApi(indicators);
      const result = await loadTopic(
        loaderArgs(
          { get } as unknown as ApiClient,
          { slug: 'topic-a' },
          `?tab-topic=${tab}&page=999`,
        ),
      );
      expect(result.content?.listing.indicators).toHaveLength(405);
      expect(result.content?.data.selected).toHaveLength(405);
      const pages = get.mock.calls
        .filter(([path]) => path.startsWith('/api/indicators/search?'))
        .map(([path]) => new URL(path, 'http://api').searchParams);
      expect(pages.map((p) => p.get('page'))).toEqual([null, '2', '3']);
      expect(pages.slice(1).every((p) => p.get('limit') === '200')).toBe(true);
    },
  );

  it('fails with a developer-facing error when the route supplies no slug', async () => {
    const get = vi.fn();

    await expect(loadTopic(loaderArgs({ get } as unknown as ApiClient))).rejects.toThrow(
      /expects a slug param/,
    );
    expect(get).not.toHaveBeenCalled();
  });

  it('lets the client 404 through so the not-found boundary renders', async () => {
    const get = vi.fn().mockRejectedValue(new Response('Not Found', { status: 404 }));

    await expect(
      loadTopic(loaderArgs({ get } as unknown as ApiClient, { slug: 'nope' })),
    ).rejects.toMatchObject({ status: 404 });
  });
});
