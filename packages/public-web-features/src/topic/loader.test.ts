import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiCall,
  type FakeApiClient,
  type FakeApiStubs,
  fails,
} from '@fphd/web-server/testing';
import type { LoaderFunctionArgs } from 'react-router';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { indicatorDetail, observation } from '../indicator/view.testing.ts';
import { loadTopic, loadTopicPage, loadTopics } from './loader.ts';

function loaderArgs(
  api: FakeApiClient,
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
    const api = createFakeApiClient({ 'GET /api/topics': topics });

    const result = await loadTopics(loaderArgs(api));

    expect(result).toEqual(topics);
  });

  it('propagates the failure the client raises rather than returning a partial page', async () => {
    const api = createFakeApiClient({
      'GET /api/topics': fails(new Response('Bad Gateway', { status: 502 })),
    });

    await expect(loadTopics(loaderArgs(api))).rejects.toBeInstanceOf(Response);
  });
});

interface ListedIndicator {
  shortId: number;
  name: string;
  slug: string;
}

function query(call: FakeApiCall) {
  return new URL(call.path, 'http://api').searchParams;
}

/** An indicator as the data endpoint answers it, with no areas. */
function tableData(shortId: number) {
  return {
    detail: indicatorDetail(shortId, { name: 'Indicator', slug: 'indicator' }),
    areaData: [],
  };
}

/**
 * Answers to a topic page's reads for the topic at `slug`, whose search finds `indicators` and
 * whose overview highlights `highlightedIndicatorIds`. An indicator in `unavailableIds` is
 * not found.
 */
function topicStubs(
  indicators: ListedIndicator[] = [],
  highlightedIndicatorIds: number[] = [],
  unavailableIds: number[] = [],
  slug = 'topic-a',
): FakeApiStubs {
  const topicPath = `/api/topics/${encodeURIComponent(slug)}`;
  const highlighted = Object.fromEntries(
    highlightedIndicatorIds.map((id) => [
      `GET /api/indicators/${id}`,
      unavailableIds.includes(id)
        ? fails(new Response('Not Found', { status: 404 }))
        : indicatorDetail(id, { name: 'Indicator', slug: 'indicator' }),
    ]),
  );

  return {
    [`GET ${topicPath}`]: {
      slug,
      title: 'Topic A',
      description: 'About topic A',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      content: {
        overviewIntro: 'About topic A.',
        highlightedIndicatorIds,
        highlightIntro: 'Highlights.',
        highlightPoints: [],
        moreInformation: { intro: 'More information.', sections: [] },
      },
    },
    [`GET ${topicPath}/trends`]: {
      total: indicators.length,
      better: 0,
      worse: 0,
      unchanged: 0,
      increasing: 0,
      decreasing: 0,
      unavailable: indicators.length,
    },
    'GET /api/areas/display-groups': [],
    'GET /api/areas': [],
    'GET /api/indicators/facets': {
      topics: [],
      classifications: [],
      sources: [],
      valueTypes: [],
      yearTypes: [],
    },
    'GET /api/indicators/search': (call) => {
      const params = query(call);
      const page = Number(params.get('page') ?? '1');
      const limit = params.has('page') ? Number(params.get('limit') ?? '10') : 200;
      return {
        total: indicators.length,
        limit,
        ...(params.has('page') ? { page } : {}),
        indicators: indicators
          .slice((page - 1) * limit, page * limit)
          .map((indicator) => ({ ...indicator, topics: [], classifications: [] })),
      };
    },
    ...highlighted,
    'GET /api/indicator-data': (call) => query(call).getAll('indicator').map(Number).map(tableData),
  };
}

/** A client that answers a topic page's reads, as `topicStubs` describes them. */
function topicApi(...stubs: Parameters<typeof topicStubs>) {
  return createFakeApiClient(topicStubs(...stubs));
}

function paths(api: FakeApiClient) {
  return api.calls.map(({ path }) => path);
}

describe('loadTopic', () => {
  it('identifies streamed filter results by the page URL rather than its data transport', async () => {
    const args = loaderArgs(topicApi(), { slug: 'topic-a' });
    args.request = new Request('http://localhost/topics/topic-a.data?tab-topic=areas');
    const { content } = await loadTopic(args);
    expect(content?.dataKey).toBe('/topics/topic-a?sort=subtopic-asc');
  });

  it('uses the area summary catalogue for its picker without loading unrelated previews', async () => {
    const area = { code: 'E54000040', name: 'Bath and North East Somerset' };
    const groups = [{ displayGroup: 'Integrated care boards', areas: [area] }];
    const api = createFakeApiClient({
      ...topicStubs(),
      'GET /api/areas/display-groups': ['Integrated care boards'],
      'GET /api/areas': (call) => {
        expect(call.path).not.toContain('limit=101');
        return groups;
      },
      'GET /api/areas/lookup': [
        { ...area, areaType: 'Integrated care boards', displayGroup: 'Integrated care boards' },
      ],
    });
    const { content } = await loadTopic(
      loaderArgs(api, { slug: 'topic-a' }, '?tab-topic=areas&geo=Integrated+care+boards'),
    );
    expect(content?.search.geographyOptions.previews).toEqual([
      { name: 'Integrated care boards', areas: [area] },
    ]);
  });

  it('returns the topic before its overview and tables have loaded', async () => {
    const api = topicApi([{ shortId: 1, name: 'Indicator', slug: 'indicator' }]);
    const gate = Promise.withResolvers<void>();
    const delayed: FakeApiClient = {
      ...api,
      get: async (path, schema) => {
        if (path.endsWith('/trends') || path.startsWith('/api/indicator-data?')) await gate.promise;
        return api.get(path, schema);
      },
    };
    const page = await loadTopicPage(loaderArgs(delayed, { slug: 'topic-a' }));
    try {
      expect(page.topic.title).toBe('Topic A');
      expect(page.overview).toBeInstanceOf(Promise);
      expect(page.content).toBeInstanceOf(Promise);
      expect(page.areas).toBeInstanceOf(Promise);
      expect(paths(api).some((path) => path.endsWith('/trends'))).toBe(false);
    } finally {
      gate.resolve();
    }
    const [overview, content, areas] = await Promise.all([page.overview, page.content, page.areas]);
    expect(overview?.highlights).toHaveLength(1);
    expect(content?.search.searchResult.total).toBe(1);
    expect(areas?.search.searchResult.total).toBe(1);
  });

  it('returns complete HTML data for the JavaScript-free fallback', async () => {
    const page = await loadTopicPage(
      loaderArgs(topicApi(), { slug: 'topic-a' }, '?render=complete'),
    );
    expect(page.complete).toBe(true);
    expect(page.overview).not.toBeInstanceOf(Promise);
    expect(page.content).not.toBeInstanceOf(Promise);
    expect(page.areas).not.toBeInstanceOf(Promise);
  });

  it.each(['data', 'areas'])(
    'keeps the active %s tab when normalising filter inputs',
    async (tab) => {
      const result = await loadTopicPage(
        loaderArgs(topicApi(), { slug: 'topic-a' }, `?tab-topic=${tab}&src-add=`),
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

  it('keeps the area-summary geography when normalising a filter form', async () => {
    const api = createFakeApiClient({
      ...topicStubs(),
      'GET /api/areas/display-groups': ['Local authorities', 'NHS regions'],
    });
    const result = await loadTopicPage(
      loaderArgs(api, { slug: 'topic-a' }, '?tab-topic=areas&geo=Local+authorities&src-add='),
    ).catch((error: unknown) => error);
    if (!(result instanceof Response)) throw new Error('Expected a filter redirect');
    expect(
      new URL(result.headers.get('Location') ?? '', 'http://localhost').searchParams.getAll('geo'),
    ).toEqual(['Local authorities']);
  });

  it.each(['overview', 'data', 'areas', 'publications'])(
    'starts every page section once when opening %s',
    async (tab) => {
      const indicators = Array.from({ length: 8 }, (_, index) => ({
        shortId: index + 1,
        name: `Indicator ${index + 1}`,
        slug: `indicator-${index + 1}`,
      }));
      const api = topicApi(indicators);
      const page = await loadTopicPage(loaderArgs(api, { slug: 'topic-a' }, `?tab-topic=${tab}`));
      const [overview, content, areas] = await Promise.all([
        page.overview,
        page.content,
        page.areas,
      ]);
      expect(overview?.highlights).toHaveLength(4);
      expect(overview).not.toHaveProperty('selected');
      expect(content?.search.searchResult.total).toBe(8);
      expect(areas?.search.searchResult.total).toBe(8);

      expect(content?.data).not.toHaveProperty('selected');
      expect(content?.listing).not.toHaveProperty('indicators');
      expect(areas?.listing).not.toHaveProperty('indicators');
      expect(content?.search.searchResult.indicators).toEqual([]);
      expect(areas?.search.searchResult.indicators).toEqual([]);
      expect(areas?.data).not.toHaveProperty('selected');
      expect(paths(api).filter((path) => path === '/api/topics/topic-a')).toHaveLength(1);
      expect(
        paths(api).filter((path) => /^\/api\/indicators\/\d+(?:\/data\?)?$/.test(path)),
      ).toHaveLength(0);
      expect(paths(api).filter((path) => path.startsWith('/api/indicator-data?'))).toHaveLength(2);
    },
  );
  it.each(['?tab-topic=publications', '?tab-topic=invalid'])(
    'loads only the topic content for %s',
    async (query) => {
      const api = topicApi();
      const result = await loadTopic(loaderArgs(api, { slug: 'topic-a' }, query));
      expect(result.content).toBeNull();
      expect(paths(api)).toEqual(['/api/topics/topic-a']);
    },
  );

  it('loads the overview count and highlighted indicators from the topic API', async () => {
    const api = topicApi([
      { shortId: 241, name: 'Diabetes prevalence', slug: 'diabetes-prevalence' },
    ]);
    const result = await loadTopic(loaderArgs(api, { slug: 'topic-a' }));
    expect(result.overview?.trends.total).toBe(1);
    expect(result.overview?.selected.map(({ detail }) => detail.shortId)).toEqual([241]);
    expect(paths(api)).toContain('/api/topics/topic-a/trends');
  });

  it('requests bounded sparkline history for highlights and preserves eight periods and null gaps', async () => {
    const series = Array.from({ length: 10 }, (_, index) => ({
      ...observation(),
      fromDate: `${2015 + index}-01-01`,
      toDate: `${2015 + index}-12-31`,
      value: index === 7 ? null : index,
    }));
    const api = createFakeApiClient({
      ...topicStubs([{ shortId: 241, name: 'Indicator', slug: 'indicator' }]),
      'GET /api/indicator-data': [
        {
          detail: indicatorDetail(241),
          areaData: [{ areaCode: 'E92000001', areaName: 'England', observations: series }],
        },
      ],
    });
    const result = await loadTopic(loaderArgs(api, { slug: 'topic-a' }));
    expect(paths(api)).toContain(
      '/api/indicator-data?indicator=241&areaCode=E92000001&observationHistory=lastEightPeriodsPerSeries',
    );
    expect(result.overview?.selected[0]?.areaData[0]?.observations).toEqual(series.slice(-8));
  });

  it('loads editorial highlights even when they are outside the first search page', async () => {
    const api = topicApi(
      [{ shortId: 241, name: 'Diabetes prevalence', slug: 'diabetes-prevalence' }],
      [93995],
    );
    const result = await loadTopic(loaderArgs(api, { slug: 'topic-a' }));
    expect(result.overview?.selected[0]?.detail.shortId).toBe(93995);
    expect(paths(api)).toContain('/api/indicators/93995');
  });

  it('skips editorial highlights that are absent from this published dataset', async () => {
    const api = topicApi(
      [{ shortId: 241, name: 'Diabetes prevalence', slug: 'diabetes-prevalence' }],
      [93995],
      [93995],
    );
    const result = await loadTopic(loaderArgs(api, { slug: 'topic-a' }));
    expect(result.overview?.selected.map(({ detail }) => detail.shortId)).toEqual([241]);
  });

  it('requests the topic by slug', async () => {
    const api = topicApi();

    await loadTopic(loaderArgs(api, { slug: 'topic-a' }));

    expect(paths(api)).toContain('/api/topics/topic-a');
  });

  it.each([['../internal'], ['../../health']])(
    'escapes a slug of %s so it cannot traverse onto another api route',
    async (slug) => {
      const api = topicApi([], [], [], slug);

      await loadTopic(loaderArgs(api, { slug }));

      // The guarantee that matters: whatever the slug, the request stays under /api/topics/.
      expect(paths(api)[0]).toMatch(/^\/api\/topics\/[^/]+$/);
    },
  );

  it('keeps the route topic as the only topic filter even with a forged query selection', async () => {
    const api = topicApi();
    await loadTopic(loaderArgs(api, { slug: 'topic-a' }, '?tab-topic=data&t=another-topic&is=999'));
    expect(paths(api)).toContain('/api/indicators/search?t=topic-a&sort=subtopic-asc');
    expect(paths(api)).not.toContain('/api/indicators/999');
  });

  it('loads the complete topic list even when an old link includes a page parameter', async () => {
    const indicators = Array.from({ length: 12 }, (_, index) => ({
      shortId: index + 1,
      name: `Indicator ${String(index + 1).padStart(2, '0')}`,
      slug: `indicator-${index + 1}`,
    }));
    const api = topicApi(indicators);
    const result = await loadTopic(loaderArgs(api, { slug: 'topic-a' }, '?tab-topic=data&page=2'));
    expect(result.content?.listing.indicators.map(({ shortId }) => shortId)).toEqual(
      indicators.map(({ shortId }) => shortId),
    );
    expect(result.content?.data.selected.map(({ detail }) => detail.shortId)).toEqual(
      indicators.map(({ shortId }) => shortId),
    );
    expect(
      api.calls.some(
        (call) =>
          call.path.startsWith('/api/indicator-data?') &&
          query(call).getAll('indicator').includes('1'),
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
      const api = topicApi(indicators);
      const result = await loadTopic(
        loaderArgs(api, { slug: 'topic-a' }, `?tab-topic=${tab}&page=999`),
      );
      expect(result.content?.listing.indicators).toHaveLength(405);
      expect(result.content?.data.selected).toHaveLength(405);
      const pages = api.calls
        .filter(({ path }) => path.startsWith('/api/indicators/search?'))
        .map(query);
      expect(pages.map((p) => p.get('page'))).toEqual([null, '2', '3']);
      expect(pages.slice(1).every((p) => p.get('limit') === '200')).toBe(true);
    },
  );

  it('fails with a developer-facing error when the route supplies no slug', async () => {
    const api = createFakeApiClient();

    await expect(loadTopic(loaderArgs(api))).rejects.toThrow(/expects a slug param/);
    expect(api.calls).toEqual([]);
  });

  it('lets the client 404 through so the not-found boundary renders', async () => {
    const api = createFakeApiClient({
      'GET /api/topics/nope': fails(new Response('Not Found', { status: 404 })),
    });

    await expect(loadTopic(loaderArgs(api, { slug: 'nope' }))).rejects.toMatchObject({
      status: 404,
    });
  });
});
