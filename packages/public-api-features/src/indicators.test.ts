import { createFakeRepositories, type FakeRepositoryOverrides } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import express, { type Express } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { indicatorTableDataSchema } from './contract.ts';
import { indicatorsRouter } from './indicators.ts';

const indicatorDetail = {
  shortId: 108,
  slug: 'under-75-mortality-rate-from-all-causes',
  name: 'Under 75 mortality rate from all causes',
  valueType: 'Directly standardised rate',
  unit: 'per 100,000',
  yearType: { value: 'calendar' as const, label: 'Calendar' },
  updateFrequency: 'annually' as const,
  updateFrequencyReason: null,
  polarity: 'lower-is-better' as const,
  ciMethod: "Dobson & Byar's methods",
  ciConfidenceLevel: '95' as const,
  comparatorMethod: null,
  dataUpdatedAt: '2026-04-20T16:25:18.000Z',
  firstPublishedAt: '2026-04-20T16:25:18.000Z',
  lastPublishedAt: '2026-04-20T16:25:18.000Z',
  definition: 'Directly age-standardised mortality rate for all deaths.',
  rationale: null,
  methodology: null,
  numeratorDefinition: null,
  denominatorDefinition: null,
  disclosureControl: null,
  caveats: null,
  notes: null,
  dataSource: { name: 'Office for National Statistics', url: null },
  numeratorSources: [],
  denominatorSources: [],
  areaTypes: [{ name: 'Counties & UAs (from Apr 2023)', areaCount: 153 }],
  topics: [{ slug: 'mortality-and-life-expectancy', title: 'Mortality and life expectancy' }],
  classifications: [
    { dimension: 'indicator_type', slug: 'indicator-type-outcome', name: 'Outcome' },
  ],
  updateSummaries: [],
};

function createTestApp(overrides: FakeRepositoryOverrides['indicators'] = {}): Express {
  const app = express();

  app.use(indicatorsRouter(createFakeRepositories({ indicators: overrides }).indicators));

  return app;
}

describe('GET /api/indicators/:indicator/ranking', () => {
  it('returns one bounded ranking batch in the requested area order', async () => {
    const data = [{ areaCode: 'E06000052', areaName: 'Cornwall', observations: [] }];
    const findRankingData = vi.fn().mockResolvedValue(data);
    const app = createTestApp({ resolveId: async () => 'ind-1', findRankingData });
    const response = await request(app).get(
      '/api/indicators/108/ranking?areaCode=E06000052&areaCode=E06000052',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual(data);
    expect(findRankingData).toHaveBeenCalledExactlyOnceWith('ind-1', ['E06000052']);
  });

  it('caps ranking areas and rejects missing areas and unpublished indicators', async () => {
    const findRankingData = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ resolveId: async () => 'ind-1', findRankingData });
    const query = new URLSearchParams(
      Array.from({ length: 501 }, (_, i): [string, string] => [
        'areaCode',
        `E${String(i).padStart(8, '0')}`,
      ]),
    );
    expect((await request(app).get(`/api/indicators/108/ranking?${query}`)).status).toBe(404);
    expect(findRankingData.mock.calls[0]?.[1]).toHaveLength(500);
    expect((await request(createTestApp()).get('/api/indicators/108/ranking')).status).toBe(404);
    expect(
      (
        await request(createTestApp({ resolveId: async () => undefined })).get(
          '/api/indicators/108/ranking?areaCode=E92000001',
        )
      ).status,
    ).toBe(404);
  });
});

describe('GET /api/indicator-data', () => {
  it.each(['', '&observationHistory=recentPerSeries', '&observationHistory=invalid'])(
    'defaults to recent history for query %s',
    async (query) => {
      const findTableData = vi.fn().mockResolvedValue([]);
      await request(createTestApp({ findTableData })).get(
        `/api/indicator-data?indicator=108${query}`,
      );
      expect(findTableData).toHaveBeenCalledExactlyOnceWith([108], ['E92000001']);
    },
  );
  it('requests current table values with precomputed trends when selected', async () => {
    const findTableData = vi.fn().mockResolvedValue([]);
    await request(createTestApp({ findTableData })).get(
      '/api/indicator-data?indicator=108&observationHistory=latestPerSeries',
    );
    expect(findTableData).toHaveBeenCalledExactlyOnceWith([108], ['E92000001'], 'latest');
  });
  it('returns a bounded batch of public table data with its contract metadata', async () => {
    const entries = [
      {
        detail: indicatorDetail,
        areaData: [{ areaCode: 'E92000001', areaName: 'England', observations: [] }],
      },
    ];
    const findTableData = vi.fn().mockResolvedValue(entries);
    const response = await request(createTestApp({ findTableData })).get(
      '/api/indicator-data?indicator=108&indicator=108',
    );
    expect(response.status).toBe(200);
    expect(indicatorTableDataSchema.parse(response.body)).toEqual(entries);
    expect(findTableData).toHaveBeenCalledWith([108], ['E92000001']);
    expect(Object.keys(response.body[0].detail)).not.toContain('id');
  });

  it('caps indicator and area batches and ignores malformed public identifiers', async () => {
    const findTableData = vi.fn().mockResolvedValue([]);
    const params = new URLSearchParams();
    for (let id = 1; id <= 25; id++) params.append('indicator', String(id));
    for (let id = 0; id < 25; id++) params.append('areaCode', `E${String(id).padStart(8, '0')}`);
    await request(createTestApp({ findTableData })).get(`/api/indicator-data?${params}`);
    expect(findTableData).toHaveBeenCalledWith(
      Array.from({ length: 20 }, (_, i) => i + 1),
      Array.from({ length: 20 }, (_, i) => `E${String(i).padStart(8, '0')}`),
    );
    expect((await request(createTestApp()).get('/api/indicator-data?indicator=nope')).status).toBe(
      404,
    );
  });

  it('refuses a partial batch when a requested indicator is not published', async () => {
    expect(
      (
        await request(createTestApp({ findTableData: async () => [] })).get(
          '/api/indicator-data?indicator=108',
        )
      ).status,
    ).toBe(404);
  });
});

describe('the public indicators surface', () => {
  it('404s data and range requests when the identifier resolves to nothing', async () => {
    const app = createTestApp({ resolveId: async () => undefined });

    expect((await request(app).get('/api/indicators/424242/data')).status).toBe(404);
    expect(
      (await request(app).get('/api/indicators/424242/range?displayGroup=Local+authorities'))
        .status,
    ).toBe(404);
  });
});

describe('GET /api/indicators', () => {
  it('searches indicators when q is given, trimming and bounding the query', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ search });

    await request(app).get('/api/indicators?q=%20%20diabetes%20%20');
    expect(search).toHaveBeenCalledWith('diabetes', 20);

    await request(app).get(`/api/indicators?q=${'a'.repeat(300)}`);
    expect(search).toHaveBeenLastCalledWith('a'.repeat(200), 20);
  });

  it('caps the search limit at 100 and ignores a malformed one', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ search });

    await request(app).get('/api/indicators?q=x&limit=500');
    expect(search).toHaveBeenCalledWith('x', 100);

    await request(app).get('/api/indicators?q=x&limit=nope');
    expect(search).toHaveBeenLastCalledWith('x', 20);
  });

  it('searches a query holding a control character as words separated by a space', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ search });

    await request(app).get('/api/indicators?q=blood%00pressure');

    expect(search).toHaveBeenCalledWith('blood pressure', 20);
  });

  it('lists every indicator when q is control characters alone', async () => {
    const listPublished = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ listPublished });

    const response = await request(app).get('/api/indicators?q=%00');

    expect(response.status).toBe(200);
    expect(listPublished).toHaveBeenCalled();
  });

  it('lists every indicator when q is empty', async () => {
    const listPublished = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ listPublished });

    const response = await request(app).get('/api/indicators?q=%20%20');

    expect(response.status).toBe(200);
    expect(listPublished).toHaveBeenCalled();
  });
});

describe('GET /api/indicators/:indicator/areas', () => {
  it('returns only the published indicator’s available areas and bounds preview searches', async () => {
    const groups = [
      { displayGroup: 'Statistical regions', areas: [{ code: 'E12000007', name: 'London' }] },
    ];
    const listAreas = vi.fn().mockResolvedValue(groups);
    const app = createTestApp({ resolveIdBySlug: async () => 'indicator-id', listAreas });
    const response = await request(app).get(
      '/api/indicators/diabetic-eye-screening-uptake/areas?displayGroup=Statistical+regions&q=+London+&limit=9999',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual(groups);
    expect(listAreas).toHaveBeenCalledWith('indicator-id', {
      scope: undefined,
      displayGroup: 'Statistical regions',
      query: 'London',
      limit: 101,
    });
  });

  it('caps unfiltered previews and preserves explicit complete group and export requests', async () => {
    const listAreas = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ resolveIdBySlug: async () => 'indicator-id', listAreas });
    for (const [query, limit] of [
      ['', 101],
      ['?q=London', 101],
      ['?displayGroup=NHS+regions', undefined],
      ['?scope=all-data', undefined],
    ] as const) {
      expect((await request(app).get(`/api/indicators/indicator-108/areas${query}`)).status).toBe(
        200,
      );
      expect(listAreas).toHaveBeenLastCalledWith(
        'indicator-id',
        expect.objectContaining({ limit }),
      );
    }
  });

  it('rejects malformed area limits without listing areas', async () => {
    const listAreas = vi.fn();
    const app = createTestApp({ resolveId: async () => 'indicator-id', listAreas });
    for (const limit of ['0', 'abc', '-1', '1.5', '']) {
      const response = await request(app).get(`/api/indicators/108/areas?limit=${limit}`);
      expect(response.status).toBe(400);
    }
    expect(listAreas).not.toHaveBeenCalled();
  });

  it.each([
    ['London%00Bridge', 'London Bridge'],
    ['%00', ''],
  ])('lists areas for a query of %s as %j', async (q, query) => {
    const listAreas = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ resolveId: async () => 'indicator-id', listAreas });

    const response = await request(app).get(`/api/indicators/108/areas?q=${q}`);

    expect(response.status).toBe(200);
    expect(listAreas).toHaveBeenCalledWith('indicator-id', expect.objectContaining({ query }));
  });

  it('answers a display group holding a control character as an unknown group, with no areas', async () => {
    const listAreas = vi.fn();
    const app = createTestApp({ resolveId: async () => 'indicator-id', listAreas });

    const response = await request(app).get('/api/indicators/108/areas?displayGroup=%00');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(listAreas).not.toHaveBeenCalled();
  });

  it('does not list areas for an unpublished or unknown indicator', async () => {
    const app = createTestApp({ resolveId: async () => undefined });
    expect((await request(app).get('/api/indicators/424242/areas')).status).toBe(404);
  });
});

describe('GET /api/indicators/:indicator', () => {
  it('finds an indicator by its short id', async () => {
    const app = createTestApp({
      resolveId: async () => 'ind-1',
      findPublishedById: async () => indicatorDetail,
    });

    const response = await request(app).get('/api/indicators/108');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(indicatorDetail);
  });

  it('returns the standard not-found body for an unknown short id', async () => {
    const app = createTestApp({ resolveId: async () => undefined });

    const response = await request(app).get('/api/indicators/424242');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('finds an indicator by its slug, case-folded, and answers 200 rather than redirecting', async () => {
    const resolveIdBySlug = vi.fn().mockResolvedValue('ind-1');
    const app = createTestApp({ resolveIdBySlug, findPublishedById: async () => indicatorDetail });

    const response = await request(app).get(
      '/api/indicators/Under-75-Mortality-Rate-From-All-Causes',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(indicatorDetail);
    expect(resolveIdBySlug).toHaveBeenCalledWith('under-75-mortality-rate-from-all-causes');
  });

  it('returns not-found for a slug no published version carries', async () => {
    const app = createTestApp({ resolveIdBySlug: async () => undefined });

    const response = await request(app).get('/api/indicators/no-such-indicator');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('rejects a segment shaped like neither identifier without touching the repository', async () => {
    // No stub: if the route reached the repository, the fake would throw and this would 500.
    const response = await request(createTestApp()).get('/api/indicators/not%20a%20slug');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('rejects a short id too large for the column without touching the repository', async () => {
    const response = await request(createTestApp()).get('/api/indicators/99999999999');

    expect(response.status).toBe(404);
  });
});

describe('GET /api/indicators/:indicator/data', () => {
  it('serves observations for an indicator, defaulting to England', async () => {
    const data = {
      areaCode: 'E92000001',
      areaName: 'England',
      observations: [
        {
          fromDate: '2023-01-01',
          toDate: '2023-12-31',
          value: 341.1,
          lowerCi95: 339,
          upperCi95: 343.2,
          lowerCi998: null,
          upperCi998: null,
          count: 130000,
          numerator: null,
          denominator: null,
          dimensions: [{ type: 'Age', value: '<75 yrs', dimensionClass: 'core', sortOrder: 1 }],
        },
      ],
    };
    const findObservationsForAreas = vi.fn().mockResolvedValue([data]);
    const app = createTestApp({ resolveId: async () => 'ind-1', findObservationsForAreas });

    const response = await request(app).get('/api/indicators/108/data');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(data);
    expect(findObservationsForAreas).toHaveBeenCalledWith('ind-1', ['E92000001']);
  });

  it('passes an explicit area code through to the repository', async () => {
    const findObservationsForAreas = vi
      .fn()
      .mockResolvedValue([{ areaCode: 'E06000001', areaName: 'Hartlepool', observations: [] }]);
    const app = createTestApp({ resolveId: async () => 'ind-1', findObservationsForAreas });

    const response = await request(app).get('/api/indicators/108/data?areaCode=E06000001');

    expect(response.status).toBe(200);
    expect(findObservationsForAreas).toHaveBeenCalledWith('ind-1', ['E06000001']);
  });

  it('reads several requested areas in one repository call', async () => {
    const findObservationsForAreas = vi
      .fn()
      .mockImplementation(async (_id: string, codes: string[]) =>
        codes.map((areaCode) => ({ areaCode, areaName: areaCode, observations: [] })),
      );
    const app = createTestApp({ resolveId: async () => 'ind-1', findObservationsForAreas });
    const response = await request(app).get(
      '/api/indicators/108/data?areaCode=E12000001&areaCode=E12000002',
    );
    expect(response.status).toBe(200);
    expect(response.body.map((entry: { areaCode: string }) => entry.areaCode)).toEqual([
      'E12000001',
      'E12000002',
    ]);
    expect(findObservationsForAreas).toHaveBeenCalledExactlyOnceWith('ind-1', [
      'E12000001',
      'E12000002',
    ]);
  });

  it('rejects a malformed area code without touching the repository', async () => {
    const response = await request(createTestApp()).get(
      '/api/indicators/108/data?areaCode=../nope',
    );

    expect(response.status).toBe(404);
  });

  it('returns not-found when none of the requested areas exist', async () => {
    const app = createTestApp({
      resolveId: async () => 'ind-1',
      findObservationsForAreas: async () => [],
    });

    const response = await request(app).get('/api/indicators/424242/data');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });
});

describe('GET /api/indicators/:indicator/range', () => {
  it('serves a per-segment range for the requested display group', async () => {
    const periods = [
      { fromDate: '2023-01-01', toDate: '2023-12-31', segment: 'Male', min: 1, max: 2 },
    ];
    const findObservationRange = vi.fn().mockResolvedValue(periods);
    const app = createTestApp({ resolveId: async () => 'ind-1', findObservationRange });

    const response = await request(app).get(
      '/api/indicators/241/range?displayGroup=Local%20authorities',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ periods });
    expect(findObservationRange).toHaveBeenCalledWith('ind-1', 'Local authorities');
  });

  it('serves a range addressed by slug', async () => {
    const findObservationRange = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ resolveIdBySlug: async () => 'ind-1', findObservationRange });

    const response = await request(app).get(
      '/api/indicators/diabetes-qof-prevalence/range?displayGroup=Local%20authorities',
    );

    expect(response.status).toBe(200);
    expect(findObservationRange).toHaveBeenCalledWith('ind-1', 'Local authorities');
  });

  it('rejects a range request without area types or with an unusable identifier', async () => {
    // No stub: if either route reached the repository, the fake would throw and 500.
    const app = createTestApp();

    expect((await request(app).get('/api/indicators/241/range')).status).toBe(404);
    expect((await request(app).get('/api/indicators/241/range?displayGroup=%00')).status).toBe(404);
    expect(
      (await request(app).get('/api/indicators/no%20pe/range?displayGroup=Local+authorities'))
        .status,
    ).toBe(404);
  });
});

describe('GET /api/indicators/search pagination and dates', () => {
  it('bounds pagination, recognises supported sorts and passes only valid date filters', async () => {
    const searchWithFilters = vi
      .fn()
      .mockResolvedValue({ total: 0, limit: 10, page: 1, indicators: [] });
    const app = createTestApp({ searchWithFilters });
    await request(app).get(
      '/api/indicators/search?t=mortality&subtopic=all-cause-and-winter-mortality&page=999&sort=trend-desc&fromYear=2010&toYear=2023&updatedWithin=6',
    );
    expect(searchWithFilters).toHaveBeenLastCalledWith(
      expect.objectContaining({
        topics: ['mortality'],
        subtopics: ['all-cause-and-winter-mortality'],
        page: 999,
        sort: 'trend-desc',
        limit: 10,
        dataFromYear: 2010,
        dataToYear: 2023,
        updatedWithinMonths: 6,
      }),
    );
    await request(app).get(
      '/api/indicators/search?page=Infinity&sort=invalid&fromYear=oops&toYear=100000&updatedWithin=999',
    );
    expect(searchWithFilters).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, limit: 10 }),
    );
    expect(searchWithFilters.mock.calls.at(-1)?.[0]).not.toHaveProperty('dataFromYear');
    expect(searchWithFilters.mock.calls.at(-1)?.[0]).not.toHaveProperty('dataToYear');
    expect(searchWithFilters.mock.calls.at(-1)?.[0]).not.toHaveProperty('updatedWithinMonths');
  });
});

describe('search ordering and workload bounds', () => {
  it('leaves relevance and topic grouping to the repository without an explicit sort', async () => {
    const searchWithFilters = vi.fn().mockResolvedValue({ total: 0, limit: 200, indicators: [] });
    const app = createTestApp({ searchWithFilters });
    await request(app).get('/api/indicators/search?q=108');
    expect(searchWithFilters.mock.calls[0]?.[0]).not.toHaveProperty('sort');
    await request(app).get('/api/indicators/search');
    expect(searchWithFilters.mock.calls[1]?.[0]).not.toHaveProperty('sort');
  });
  it.each([
    ['blood%09pressure', 'blood pressure'],
    ['blood%00pressure', 'blood pressure'],
    ['%00', ''],
  ])('searches a query of %s as %j', async (q, query) => {
    const searchWithFilters = vi.fn().mockResolvedValue({ total: 0, limit: 200, indicators: [] });
    const response = await request(createTestApp({ searchWithFilters })).get(
      `/api/indicators/search?q=${q}`,
    );
    expect(response.status).toBe(200);
    expect(searchWithFilters).toHaveBeenCalledWith(expect.objectContaining({ query }));
  });
  it('ignores a filter value holding a control character', async () => {
    const searchWithFilters = vi.fn().mockResolvedValue({ total: 0, limit: 200, indicators: [] });
    await request(createTestApp({ searchWithFilters })).get(
      '/api/indicators/search?t=diabetes&t=%00&src=%7F',
    );
    expect(searchWithFilters).toHaveBeenCalledWith(
      expect.objectContaining({ topics: ['diabetes'], sources: [] }),
    );
  });
  it('requires one topic before evaluating a trend sort', async () => {
    const searchWithFilters = vi.fn();
    const response = await request(createTestApp({ searchWithFilters })).get(
      '/api/indicators/search?sort=trend-desc',
    );
    expect(response.status).toBe(400);
    expect(searchWithFilters).not.toHaveBeenCalled();
  });
  it('bounds explicit paged requests for complete topic loading', async () => {
    const searchWithFilters = vi.fn().mockResolvedValue({ total: 0, limit: 200, indicators: [] });
    await request(createTestApp({ searchWithFilters })).get(
      '/api/indicators/search?t=diabetes&page=2&limit=9999',
    );
    expect(searchWithFilters).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 200 }),
    );
  });
});
