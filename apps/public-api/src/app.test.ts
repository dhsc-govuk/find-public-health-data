import type { Topic } from '@fphd/db';
import { createFakeRepositories } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import { createLogger } from '@fphd/logger';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from './app.ts';

const logger = createLogger({ name: 'public-api', level: 'silent' });

const topic: Topic = {
  id: '00000000-0000-7000-8000-000000000001',
  slug: 'topic-a',
  title: 'Topic A',
  description: 'All about topic A.',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-02T00:00:00.000Z'),
};

// Any well-formed id: the public app rejects an internal path before it reads one.
const anyId = '00000000-0000-7000-8000-000000000002';

function createTestApp(repositories = createFakeRepositories()) {
  return createApp({ logger, repositories });
}

describe('public API', () => {
  it('mounts the public bulk table-data surface', async () => {
    const data = [
      {
        detail: { shortId: 108, slug: 'mortality', name: 'Mortality' },
        areaData: [{ areaCode: 'E92000001', areaName: 'England', observations: [] }],
        tableSeries: [
          {
            sex: '',
            periodType: 'all',
            segments: { E92000001: 'Age:All ages' },
            trends: { E92000001: 'up' },
            rowOrder: { E92000001: 0 },
          },
        ],
      },
    ];
    const findTableData = vi.fn().mockResolvedValue(data);
    const response = await request(
      createTestApp(createFakeRepositories({ indicators: { findTableData } })),
    ).get('/api/indicator-data?indicator=108');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(data);
    expect(JSON.stringify(response.body)).not.toContain(anyId);
    expect(findTableData).toHaveBeenCalledWith([108], ['E92000001']);
  });

  it('exposes compact rankings using public area codes without internal row ids', async () => {
    const data = [{ areaCode: 'E06000052', areaName: 'Cornwall', observations: [] }];
    const findRankingData = vi.fn().mockResolvedValue(data);
    const repositories = createFakeRepositories({
      indicators: { resolveId: async () => anyId, findRankingData },
    });
    const response = await request(createTestApp(repositories)).get(
      '/api/indicators/108/ranking?areaCode=E06000052',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual(data);
    expect(JSON.stringify(response.body)).not.toContain(anyId);
    expect(findRankingData).toHaveBeenCalledWith(anyId, ['E06000052']);
  });
  it('reports its health', async () => {
    const response = await request(createTestApp()).get('/livez');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'public-api' });
  });

  it('describes itself as the public surface', async () => {
    const response = await request(createTestApp()).get('/api');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ audience: 'public' });
  });

  it('asks every cache in front to keep no copy, whatever the outcome', async () => {
    const repositories = createFakeRepositories({ topics: { list: async () => [topic] } });
    const app = createTestApp(repositories);

    const responses = await Promise.all([
      request(app).get('/api'),
      request(app).get('/api/topics'),
      request(app).get('/api/nowhere'),
      request(app).get('/api/indicators'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 404, 500]);
    for (const response of responses) {
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  // check:artefacts keeps every @fphd/internal-* package out of this app; these confirm nothing
  // answers under /api/internal all the same.
  it.each([
    ['put', `/api/internal/indicators/${anyId}/tagging`],
    ['post', `/api/internal/indicators/${anyId}/data-uploads`],
    ['put', `/api/internal/indicators/${anyId}/data-table/confirmation`],
    ['get', '/api/internal/topics'],
    ['get', `/api/internal/indicators/${anyId}/reviewer-options`],
    ['get', `/api/internal/indicators/${anyId}/notes-for-reviewers`],
    ['get', `/api/internal/indicators/${anyId}/history`],
    ['post', `/api/internal/indicators/${anyId}/assign-reviewers`],
    ['post', `/api/internal/indicators/${anyId}/review-response`],
    ['get', `/api/internal/indicators/${anyId}/reviewer-notes`],
    ['post', `/api/internal/indicators/${anyId}/reviewer-notes`],
    ['put', `/api/internal/indicators/${anyId}/reviewer-notes/${anyId}`],
    ['get', `/api/internal/indicators/${anyId}/revision-response`],
    ['put', `/api/internal/indicators/${anyId}/revision-response`],
    ['get', '/api/internal/indicators-under-review'],
    ['get', '/api/internal/indicators-to-review'],
    ['post', `/api/internal/indicators/${anyId}/schedule`],
    ['get', '/api/internal/indicators-scheduled'],
  ] as const)('does not expose the internal surface at %s %s', async (method, path) => {
    const response = await request(createTestApp())[method](path);

    expect(response.status).toBe(404);
  });

  // One request per resource: the routers' own behaviour is tested in
  // `@fphd/public-api-features`, so these only pin that each is mounted.
  it('mounts the public topics surface', async () => {
    const repositories = createFakeRepositories({ topics: { list: async () => [topic] } });

    const response = await request(createTestApp(repositories)).get('/api/topics');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        slug: 'topic-a',
        title: 'Topic A',
        description: 'All about topic A.',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('mounts the public indicators surface', async () => {
    const repositories = createFakeRepositories({ indicators: { listPublished: async () => [] } });

    const response = await request(createTestApp(repositories)).get('/api/indicators');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ indicators: [] });
  });

  it('exposes indicator area coverage without internal row ids', async () => {
    const groups = [
      { displayGroup: 'Statistical regions', areas: [{ code: 'E12000007', name: 'London' }] },
    ];
    const repositories = createFakeRepositories({
      indicators: { resolveIdBySlug: async () => anyId, listAreas: async () => groups },
    });
    const response = await request(createTestApp(repositories)).get(
      '/api/indicators/diabetes/areas',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual(groups);
    expect(JSON.stringify(response.body)).not.toContain(anyId);
  });

  // The UUID is internal: the list is the one public response that ever carried it.
  it('lists an indicator by its public identifiers alone, without the row id', async () => {
    const repositories = createFakeRepositories({
      indicators: {
        listPublished: async () => [{ shortId: 108, slug: 'mortality', name: 'Mortality' }],
      },
    });

    const response = await request(createTestApp(repositories)).get('/api/indicators');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      indicators: [{ shortId: 108, slug: 'mortality', name: 'Mortality' }],
    });
  });

  it('omits the row id from a filtered indicator list too', async () => {
    const repositories = createFakeRepositories({
      indicators: {
        search: async () => [{ shortId: 108, slug: 'mortality', name: 'Mortality' }],
      },
    });

    const response = await request(createTestApp(repositories)).get('/api/indicators?q=mortality');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      indicators: [{ shortId: 108, slug: 'mortality', name: 'Mortality' }],
    });
  });

  it('mounts the public areas surface', async () => {
    const repositories = createFakeRepositories({
      areas: { listByType: async () => [{ code: 'E12000001', name: 'North East region' }] },
    });

    const response = await request(createTestApp(repositories)).get(
      `/api/areas?areaType=${encodeURIComponent('Regions (statistical)')}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        areaType: 'Regions (statistical)',
        areas: [{ code: 'E12000001', name: 'North East region' }],
      },
    ]);
  });

  it('answers an unknown path with the standard not-found body', async () => {
    const response = await request(createTestApp()).get('/api/nowhere');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('returns a 500 when the repository fails', async () => {
    const repositories = createFakeRepositories({
      topics: { list: () => Promise.reject(new Error('database unavailable')) },
    });

    const response = await request(createTestApp(repositories)).get('/api/topics');

    expect(response.status).toBe(500);
  });

  it('fails loudly when a route reaches for a repository the test did not stub', async () => {
    const response = await request(createTestApp()).get('/api/topics');

    expect(response.status).toBe(500);
  });

  it('returns facets from the repository passthrough', async () => {
    const facets = {
      topics: [{ slug: 'cancer', title: 'Cancer' }],
      classifications: [{ dimension: 'indicator_type', slug: 'outcome', name: 'Outcome' }],
      sources: ['ONS'],
      valueTypes: ['Proportion'],
      yearTypes: ['Calendar'],
    };
    const listFacets = vi.fn().mockResolvedValue(facets);
    const app = createApp({
      logger,
      repositories: createFakeRepositories({ indicators: { listFacets } }),
    });

    const response = await request(app).get('/api/indicators/facets');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(facets);
    expect(listFacets).toHaveBeenCalledOnce();
  });

  it('passes q and every dimension param to searchWithFilters with limit 200', async () => {
    const result = { total: 0, limit: 200, indicators: [] };
    const searchWithFilters = vi.fn().mockResolvedValue(result);
    const app = createApp({
      logger,
      repositories: createFakeRepositories({ indicators: { searchWithFilters } }),
    });

    await request(app).get(
      '/api/indicators/search?q=diabetes&t=cancer&it=outcome&ls=older-people&fw=nof&pg=adults&eq=deprivation&displayGroup=Local+authorities&areaCode=E07000223&src=ONS&vt=Proportion&per=Calendar',
    );

    expect(searchWithFilters).toHaveBeenCalledWith({
      query: 'diabetes',
      topics: ['cancer'],
      indicatorTypes: ['outcome'],
      lifeStages: ['older-people'],
      frameworks: ['nof'],
      populations: ['adults'],
      inequalities: ['deprivation'],
      displayGroups: ['Local authorities'],
      areaCodes: ['E07000223'],
      sources: ['ONS'],
      valueTypes: ['Proportion'],
      yearTypes: ['Calendar'],
      limit: 200,
    });
  });

  it('deduplicates repeated search filter values', async () => {
    const searchWithFilters = vi.fn().mockResolvedValue({ total: 0, limit: 200, indicators: [] });
    const app = createApp({
      logger,
      repositories: createFakeRepositories({ indicators: { searchWithFilters } }),
    });

    await request(app).get('/api/indicators/search?t=cancer&t=cancer&t=diabetes');

    expect(searchWithFilters).toHaveBeenCalledWith(
      expect.objectContaining({ topics: ['cancer', 'diabetes'] }),
    );
  });

  it('drops invalid search filter values', async () => {
    const searchWithFilters = vi.fn().mockResolvedValue({ total: 0, limit: 200, indicators: [] });
    const app = createApp({
      logger,
      repositories: createFakeRepositories({ indicators: { searchWithFilters } }),
    });

    const long = 'a'.repeat(101);
    await request(app).get(
      `/api/indicators/search?t=&t=${long}&t=valid&areaCode=not-valid&areaCode=E07000223`,
    );

    expect(searchWithFilters).toHaveBeenCalledWith(
      expect.objectContaining({ topics: ['valid'], areaCodes: ['E07000223'] }),
    );
  });

  it('accepts source names longer than the slug limit without truncation', async () => {
    const searchWithFilters = vi.fn().mockResolvedValue({ total: 0, limit: 200, indicators: [] });
    const app = createApp({
      logger,
      repositories: createFakeRepositories({ indicators: { searchWithFilters } }),
    });
    const source = 'A data source with a full attribution '.repeat(6);
    await request(app).get('/api/indicators/search').query({ src: source });
    expect(searchWithFilters).toHaveBeenCalledWith(expect.objectContaining({ sources: [source] }));
  });

  it('drops source names beyond the filter label limit', async () => {
    const searchWithFilters = vi.fn().mockResolvedValue({ total: 0, limit: 200, indicators: [] });
    const app = createApp({
      logger,
      repositories: createFakeRepositories({ indicators: { searchWithFilters } }),
    });
    await request(app)
      .get('/api/indicators/search')
      .query({ src: 's'.repeat(501) });
    expect(searchWithFilters).toHaveBeenCalledWith(expect.objectContaining({ sources: [] }));
  });

  it('caps each filter list at 100 entries', async () => {
    const searchWithFilters = vi.fn().mockResolvedValue({ total: 0, limit: 200, indicators: [] });
    const app = createApp({
      logger,
      repositories: createFakeRepositories({ indicators: { searchWithFilters } }),
    });

    const many = Array.from({ length: 110 }, (_, i) => `t=topic-${i}`).join('&');
    await request(app).get(`/api/indicators/search?${many}`);

    expect(searchWithFilters).toHaveBeenCalledWith(
      expect.objectContaining({ topics: expect.arrayContaining([]) }),
    );
    const [firstCall] = searchWithFilters.mock.calls;
    expect(firstCall?.[0].topics).toHaveLength(100);
  });

  it('does not route /api/indicators/search to the :shortId handler', async () => {
    // Without a stub, reaching the :shortId route would 500; it must 200 instead.
    const searchWithFilters = vi.fn().mockResolvedValue({ total: 0, limit: 200, indicators: [] });
    const app = createApp({
      logger,
      repositories: createFakeRepositories({ indicators: { searchWithFilters } }),
    });

    const response = await request(app).get('/api/indicators/search');
    expect(response.status).not.toBe(404);
  });

  it('does not route /api/indicators/facets to the :shortId handler', async () => {
    const listFacets = vi.fn().mockResolvedValue({
      topics: [],
      classifications: [],
      sources: [],
      valueTypes: [],
      yearTypes: [],
    });
    const app = createApp({
      logger,
      repositories: createFakeRepositories({ indicators: { listFacets } }),
    });

    const response = await request(app).get('/api/indicators/facets');
    expect(response.status).not.toBe(404);
    expect(response.status).toBe(200);
  });
});
