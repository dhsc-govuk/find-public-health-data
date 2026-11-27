import { createFakeRepositories, type FakeRepositoryOverrides } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import express, { type Express } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  indicatorDetailSchema,
  indicatorGoalSchema,
  indicatorTableDataSchema,
} from './contract.ts';
import { indicatorsRouter } from './indicators.ts';

const indicatorDetail = {
  goal: null,
  shortId: 108,
  slug: 'under-75-mortality-rate-from-all-causes',
  name: 'Under 75 mortality rate from all causes',
  valueType: 'Directly standardised rate',
  valueMeasure: null,
  unit: 'per 100,000',
  yearType: { value: 'calendar' as const, label: 'Calendar' },
  updateFrequency: 'annually' as const,
  updateFrequencyReason: null,
  updateFrequencyText: null,
  updateFrequencyYears: null,
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
  numeratorDisclosureControl: null,
  denominatorDisclosureControl: null,
  caveats: null,
  notes: null,
  dataSource: { name: 'Office for National Statistics', url: null },
  numeratorSources: [],
  denominatorSources: [],
  dataValues: [],
  areaTypes: [{ name: 'Counties & UAs (from Apr 2023)', areaCount: 153 }],
  topics: [{ slug: 'mortality-and-life-expectancy', title: 'Mortality and life expectancy' }],
  classifications: [
    { dimension: 'indicator_type', slug: 'indicator-type-outcome', name: 'Outcome' },
  ],
  updateSummaries: [],
  publishedGroupings: [],
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
  it('requests bounded sparkline periods separately from recent trend history', async () => {
    const findTableData = vi.fn().mockResolvedValue([]);
    await request(createTestApp({ findTableData })).get(
      '/api/indicator-data?indicator=108&observationHistory=lastEightPeriodsPerSeries',
    );
    expect(findTableData).toHaveBeenCalledExactlyOnceWith([108], ['E92000001'], 'sparkline');
  });
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

  it('passes a parent area type through so a listing can group areas by region', async () => {
    const listAreas = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ resolveIdBySlug: async () => 'indicator-id', listAreas });
    await request(app).get(
      '/api/indicators/indicator-108/areas?displayGroup=Local+authorities&parentType=Regions+(statistical)',
    );
    expect(listAreas).toHaveBeenLastCalledWith(
      'indicator-id',
      expect.objectContaining({ parentType: 'Regions (statistical)' }),
    );
    await request(app).get('/api/indicators/indicator-108/areas?parentType=Bad%00Type');
    expect(listAreas).toHaveBeenLastCalledWith(
      'indicator-id',
      expect.not.objectContaining({ parentType: expect.anything() }),
    );
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

const foundDetail = { ...indicatorDetail, unanswered: [] };

describe('GET /api/indicators/:indicator', () => {
  it('finds an indicator by its short id', async () => {
    const app = createTestApp({
      resolveId: async () => 'ind-1',
      findDetailById: async () => foundDetail,
    });

    const response = await request(app).get('/api/indicators/108');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(indicatorDetail);
  });

  it.each([
    ['value type', { valueType: null, unanswered: ['valueType' as const] }],
    ['unit', { unit: null, unanswered: ['unit' as const] }],
    ['polarity', { polarity: null, unanswered: ['polarity' as const] }],
  ])('returns not-found for an indicator with no %s', async (_question, missing) => {
    const app = createTestApp({
      resolveId: async () => 'ind-1',
      findDetailById: async () => ({ ...foundDetail, ...missing }),
    });

    const response = await request(app).get('/api/indicators/108');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('answers with the detail body a mount gives, or not found when it gives none', async () => {
    const detailBody = vi.fn(async (detail: object, indicatorId: string) =>
      indicatorId === 'ind-1' ? { ...detail, dataState: 'ready' } : undefined,
    );
    const app = express().use(
      indicatorsRouter(
        createFakeRepositories({
          indicators: {
            resolveId: async (shortId) => (shortId === 108 ? 'ind-1' : 'ind-2'),
            findDetailById: async () => ({ ...foundDetail, polarity: null }),
          },
        }).indicators,
        { detailBody },
      ),
    );

    const found = await request(app).get('/api/indicators/108');
    const refused = await request(app).get('/api/indicators/241');

    expect(found.body).toEqual({ ...foundDetail, polarity: null, dataState: 'ready' });
    expect(refused.status).toBe(404);
  });

  it('serves an indicator imported without an update frequency, with no unanswered list', async () => {
    const app = createTestApp({
      resolveId: async () => 'ind-1',
      findDetailById: async () => ({
        ...foundDetail,
        updateFrequency: null,
        unanswered: ['updateFrequency' as const],
      }),
    });

    const response = await request(app).get('/api/indicators/108');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...indicatorDetail, updateFrequency: null });
  });

  it('returns the standard not-found body for an unknown short id', async () => {
    const app = createTestApp({ resolveId: async () => undefined });

    const response = await request(app).get('/api/indicators/424242');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('finds an indicator by its slug, case-folded, and answers 200 rather than redirecting', async () => {
    const resolveIdBySlug = vi.fn().mockResolvedValue('ind-1');
    const app = createTestApp({ resolveIdBySlug, findDetailById: async () => foundDetail });

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

  it('reads areas whose Fingertips codes hold underscores, dots and hyphens', async () => {
    const codes = ['Cl_L3_1a1', 'ONS_1.01.01', 'M-NMW'];
    const findObservationsForAreas = vi
      .fn()
      .mockImplementation(async (_id: string, codes: string[]) =>
        codes.map((areaCode) => ({ areaCode, areaName: areaCode, observations: [] })),
      );
    const app = createTestApp({ resolveId: async () => 'ind-1', findObservationsForAreas });
    const response = await request(app).get(
      `/api/indicators/108/data?${codes.map((code) => `areaCode=${code}`).join('&')}`,
    );
    expect(response.status).toBe(200);
    expect(findObservationsForAreas).toHaveBeenCalledExactlyOnceWith('ind-1', codes);
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
  it.each(['upper', 'lower'])(
    'serves the England %s council range without changing display-group reads',
    async (tier) => {
      const findObservationRangeByTier = vi.fn().mockResolvedValue([]);
      const findObservationRange = vi.fn().mockResolvedValue([]);
      const app = createTestApp({
        resolveId: async () => 'ind-1',
        findObservationRangeByTier,
        findObservationRange,
      });
      expect((await request(app).get(`/api/indicators/241/range?tier=${tier}`)).body).toEqual({
        periods: [],
      });
      expect(findObservationRangeByTier).toHaveBeenCalledExactlyOnceWith('ind-1', tier, undefined);
      expect(findObservationRange).not.toHaveBeenCalled();
      await request(app).get('/api/indicators/241/range?displayGroup=Local+authorities');
      expect(findObservationRange).toHaveBeenCalledExactlyOnceWith('ind-1', 'Local authorities');
      expect(findObservationRangeByTier).toHaveBeenCalledTimes(1);
    },
  );
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

  it.each(['241', 'diabetes-qof-prevalence'])(
    'serves a parent range at the requested council tier for %s',
    async (identifier) => {
      const periods = [
        {
          fromDate: '2024-04-01',
          toDate: '2025-03-31',
          segment: '18+ yrs',
          min: 5,
          p25: 6.5,
          p75: 7.9,
          max: 11,
          quintileCutoffs: [6, 7, 8, 9],
        },
      ];
      const findObservationRangeByTier = vi.fn().mockResolvedValue(periods);
      const app = createTestApp({
        resolveId: async () => 'ind-1',
        resolveIdBySlug: async () => 'ind-1',
        findObservationRangeByTier,
      });
      const response = await request(app).get(
        `/api/indicators/${identifier}/range?tier=upper&parent=E12000008`,
      );
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ periods });
      expect(findObservationRangeByTier).toHaveBeenCalledExactlyOnceWith(
        'ind-1',
        'upper',
        'E12000008',
      );
    },
  );

  it('returns no periods for an unknown parent and 404 for an unknown indicator', async () => {
    const app = createTestApp({
      resolveId: async (id) => (id === 241 ? 'ind-1' : undefined),
      findObservationRangeByTier: async () => [],
    });
    const query = 'tier=upper&parent=UNKNOWN';
    expect((await request(app).get(`/api/indicators/241/range?${query}`)).body).toEqual({
      periods: [],
    });
    expect((await request(app).get(`/api/indicators/999999/range?${query}`)).status).toBe(404);
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
  it('passes the recently updated sort to the repository with or without a keyword', async () => {
    const searchWithFilters = vi.fn().mockResolvedValue({ total: 0, limit: 200, indicators: [] });
    const app = createTestApp({ searchWithFilters });
    await request(app).get('/api/indicators/search?q=diabetes&sort=recently-updated');
    expect(searchWithFilters).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'diabetes', sort: 'recently-updated' }),
    );
    await request(app).get('/api/indicators/search?sort=recently-updated');
    expect(searchWithFilters).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: '', sort: 'recently-updated' }),
    );
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

describe('GET /api/indicator-scatter', () => {
  it('loads one bounded pair in axis and area order, including an empty scatter', async () => {
    const findScatterData = vi
      .fn()
      .mockResolvedValue({ points: [], variants: [], rankings: [[], []] });
    const response = await request(createTestApp({ findScatterData })).get(
      '/api/indicator-scatter?indicator=241&indicator=108&areaCode=E06000052&areaCode=E92000001&areaCode=E06000052',
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ points: [], variants: [], rankings: [[], []] });
    expect(findScatterData).toHaveBeenCalledExactlyOnceWith([241, 108], ['E06000052', 'E92000001']);
  });

  it('caps areas and rejects incomplete, repeated or unpublished indicators', async () => {
    const findScatterData = vi.fn(async (ids: [number, number], _codes: string[]) =>
      ids.includes(999) ? undefined : { points: [], variants: [], rankings: [[], []] },
    );
    const app = createTestApp({ findScatterData });
    const query = new URLSearchParams(
      Array.from({ length: 501 }, (_, i) => ['areaCode', `E${String(i).padStart(8, '0')}`]),
    );
    expect(
      (await request(app).get(`/api/indicator-scatter?indicator=108&indicator=241&${query}`))
        .status,
    ).toBe(200);
    expect(findScatterData.mock.calls[0]?.[1]).toHaveLength(500);
    for (const query of [
      'indicator=108&indicator=241',
      'areaCode=E92000001',
      'indicator=108&areaCode=E92000001',
      'indicator=108&indicator=108&areaCode=E92000001',
      'indicator=108&indicator=241&indicator=40501&areaCode=E92000001',
      'indicator=bad&indicator=108&areaCode=E92000001',
      'indicator=999&indicator=108&areaCode=E92000001',
      'indicator=108&indicator=999&areaCode=E92000001',
    ])
      expect((await request(app).get(`/api/indicator-scatter?${query}`)).status).toBe(404);
    expect(findScatterData).toHaveBeenCalledTimes(3);
  });
});

describe('category range query', () => {
  const category = '019de0d5-c800-700b-8000-0000001e8480';
  it.each(['241', 'diabetes-qof-prevalence'])(
    'serves a category range for %s',
    async (identifier) => {
      const periods = [
        {
          fromDate: '2023-01-01',
          toDate: '2023-12-31',
          segment: 'Male',
          min: 1,
          max: 2,
          p25: 1.25,
          p75: 1.75,
          quintileCutoffs: null,
        },
      ];
      const findObservationRangeByCategory = vi.fn().mockResolvedValue(periods);
      const app = createTestApp({
        resolveId: async () => 'ind-1',
        resolveIdBySlug: async () => 'ind-1',
        findObservationRangeByCategory,
      });
      const response = await request(app).get(
        `/api/indicators/${identifier}/range?category=${category}`,
      );
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ periods });
      expect(findObservationRangeByCategory).toHaveBeenCalledWith('ind-1', category);
    },
  );

  it.each([
    'category=',
    'category=not-a-uuid',
    'category=%00',
    `category=${category}&displayGroup=Local+authorities`,
    `category=${category}&displayGroup=`,
    `category=${category}&parent=E12000008`,
    `category=${category}&parent=`,
    `category=${category}&parent=E12000008&displayGroup=Local+authorities`,
    `category=${category}&category=${category}`,
    `category[value]=${category}`,
    'displayGroup=Local+authorities&displayGroup=Regions',
    'parent=E12000008',
    'parent=E12000008&displayGroup=',
    'parent=&displayGroup=Local+authorities',
    'parent=%00&displayGroup=Local+authorities',
    'parent=South+East&displayGroup=Local+authorities',
    'parent=E12000008&parent=E12000009&displayGroup=Local+authorities',
    'tier=',
    'tier=middle',
    'tier=upper&tier=lower',
    'tier[value]=upper',
    'tier=upper&displayGroup=Local+authorities',
    `tier=upper&category=${category}`,
    `tier=lower&parent=E12000008&category=${category}`,
    'tier=upper&parent=',
    'tier=lower&parent=South+East',
    'tier=upper&parent=E12000008&parent=E12000009',
  ])('rejects malformed or ambiguous selectors: %s', async (query) => {
    const response = await request(createTestApp()).get(`/api/indicators/241/range?${query}`);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });

  it('returns no periods for an unknown category and 404 for an unknown indicator', async () => {
    const app = createTestApp({
      resolveId: async (id) => (id === 241 ? 'ind-1' : undefined),
      findObservationRangeByCategory: async () => [],
    });
    expect((await request(app).get(`/api/indicators/241/range?category=${category}`)).body).toEqual(
      { periods: [] },
    );
    expect(
      (await request(app).get(`/api/indicators/999999/range?category=${category}`)).status,
    ).toBe(404);
  });
});

describe('public policy goals', () => {
  it.each([
    null,
    {
      lower: 95.5,
      lowerComparison: 'less-than',
      upper: null,
      upperComparison: null,
      polarity: 'higher-is-better',
      policyDetail: 'National policy',
    },
    {
      lower: 1,
      lowerComparison: 'less-than-or-equal',
      upper: 5,
      upperComparison: 'more-than-or-equal',
      polarity: 'lower-is-better',
      policyDetail: null,
    },
  ])('serves and validates goal %j', async (goal) => {
    const detail = {
      ...indicatorDetail,
      goal: indicatorGoalSchema.nullable().parse(goal),
      unanswered: [],
    };
    const app = createTestApp({
      resolveId: async () => 'ind-1',
      findDetailById: async () => detail,
    });
    const response = await request(app).get('/api/indicators/108');
    expect(response.status).toBe(200);
    expect(indicatorDetailSchema.parse(response.body).goal).toEqual(goal);
  });

  it('rejects string values, unsupported polarities and a comparison on the wrong value', () => {
    const goal = {
      lower: 95,
      lowerComparison: 'less-than',
      upper: null,
      upperComparison: null,
      polarity: 'higher-is-better',
      policyDetail: null,
    };

    expect(indicatorGoalSchema.safeParse(goal).success).toBe(true);
    expect(indicatorGoalSchema.safeParse({ ...goal, lower: '95' }).success).toBe(false);
    expect(indicatorGoalSchema.safeParse({ ...goal, polarity: 'no-judgement' }).success).toBe(
      false,
    );
    expect(indicatorGoalSchema.safeParse({ ...goal, lowerComparison: 'more-than' }).success).toBe(
      false,
    );
  });
});
