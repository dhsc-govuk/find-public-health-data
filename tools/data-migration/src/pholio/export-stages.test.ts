import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DATA_MIGRATION_NULL } from '@fphd/db-operations/data-migration-contract';
import type mssql from 'mssql';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { readGzipCsv } from '../csv.ts';
import { checkSlugs } from '../indicator-checks.ts';
import type { ObservationExportOptions, PholioExportOptions } from './context.ts';
import { exportDimensions } from './dimensions.ts';
import { exportGeography } from './geography.ts';
import {
  ageDimensionValueId,
  areaId,
  compoundAgeDimensionValueId,
  indicatorGroupingId,
  observationId,
  sexDimensionValueId,
} from './ids.ts';
import { exportIndicators } from './indicators.ts';
import { exportLookups } from './lookups.ts';
import { exportObservations, observationDimensions } from './observations.ts';
import publishedInvertedIntervals from './published-inverted-intervals.ts';
import { queryPholio, streamPholio } from './source.ts';
import verifiedIntervals from './vaccination-interval-corrections.ts';

vi.mock('./source.ts', () => ({ queryPholio: vi.fn(), streamPholio: vi.fn() }));
let directory: string;
let options: PholioExportOptions;
beforeEach(async () => {
  vi.resetAllMocks();
  directory = await mkdtemp(join(tmpdir(), 'fphd-export-stages-'));
  options = {
    pool: {} as mssql.ConnectionPool,
    outDir: directory,
    excludedIndicators: [],
    indicatorSelection: { kind: 'approved', indicators: [108] },
  };
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
async function rows(table: string) {
  const out = [];
  for await (const row of readGzipCsv(join(directory, `${table}.csv.gz`))) out.push(row);
  const header = out.shift() ?? [];
  return out.map((row) => Object.fromEntries(header.map((column, index) => [column, row[index]])));
}

it('preserves exact area identities, source status and unknown validity dates', async () => {
  vi.mocked(queryPholio)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      { AreaCode: 'nS1', AreaName: 'Alias', AreaTypeID: 1, IsCurrent: true },
      { AreaCode: 'S1', AreaName: 'Canonical', AreaTypeID: 1, IsCurrent: true },
      { AreaCode: 'W1', AreaName: 'Welsh', AreaTypeID: 1, IsCurrent: true },
      { AreaCode: 'N81001', AreaName: 'Audlem Medical Practice', AreaTypeID: 7, IsCurrent: true },
      { AreaCode: 'nSTP_1', AreaName: 'Retired group', AreaTypeID: 120, IsCurrent: false },
    ])
    .mockResolvedValueOnce([{ ParentLevelGeographyCode: 'nS1', ChildLevelGeographyCode: 'W1' }]);
  const result = await exportGeography(options);
  expect(result.areaIdByPholioCode.get('nS1')).toBe(areaId('nS1'));
  expect(result.areaIdByPholioCode.get('S1')).toBe(areaId('S1'));
  expect((await rows('area')).find((row) => row.code === 'S1')?.name).toBe('Canonical');
  expect((await rows('area_relationship'))[0]?.parent_area_id).toBe(String(areaId('nS1')));
  expect((await rows('area')).find((row) => row.code === 'N81001')).toMatchObject({
    valid_from: DATA_MIGRATION_NULL,
    valid_to: DATA_MIGRATION_NULL,
    is_current: 't',
  });
  expect((await rows('area')).find((row) => row.code === 'nSTP_1')).toMatchObject({
    valid_from: DATA_MIGRATION_NULL,
    valid_to: DATA_MIGRATION_NULL,
    is_current: 'f',
  });
});

it('chooses age parents only from dimension values that were emitted', async () => {
  vi.mocked(queryPholio)
    .mockResolvedValueOnce([
      { AgeID: 1, Age: 'All ages', Sequence: 0, MinYears: null, MaxYears: null },
      { AgeID: 2, Age: 'Young', Sequence: 1, MinYears: 10, MaxYears: 20 },
      { AgeID: 3, Age: 'Broad', Sequence: 2, MinYears: 0, MaxYears: 65 },
      { AgeID: 209, Age: 'Compound', Sequence: 3, MinYears: 5, MaxYears: 25 },
    ])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
  await exportDimensions(options);
  const values = await rows('dimension_value');
  expect(values.find((row) => row.id === String(ageDimensionValueId(2)))?.parent_id).toBe(
    String(ageDimensionValueId(3)),
  );
  expect(values.some((row) => row.id === String(ageDimensionValueId(209)))).toBe(false);
});

function sourceObservations(
  sourceRows: object[],
  groupings: object[] = [
    {
      IndicatorID: 108,
      AreaTypeID: 15,
      SexID: 4,
      AgeID: 1,
      YearRange: 1,
      BaselineQuarter: -1,
      BaselineMonth: -1,
    },
  ],
) {
  vi.mocked(streamPholio).mockImplementation(async (_pool, query, consume) => {
    const sorted = [...sourceRows] as Record<string, unknown>[];
    sorted.sort((a, b) =>
      query.includes('ORDER BY c.IndicatorID')
        ? Number(a.IndicatorID) - Number(b.IndicatorID) || Number(a.uid) - Number(b.uid)
        : Number(a.uid) - Number(b.uid),
    );
    for (const row of sorted) await consume(row);
    return sorted.length;
  });
  vi.mocked(queryPholio).mockImplementation(async (_pool, query) => {
    if (query.includes('FROM dbo.Grouping')) return groupings as Record<string, unknown>[];
    const uids = new Set((/uid IN \(([^)]*)\)/.exec(query)?.[1] ?? '').split(',').map(Number));
    return (sourceRows as Record<string, unknown>[]).filter((row) => uids.has(Number(row.uid)));
  });
}
function observation(overrides: object = {}) {
  return {
    uid: 1,
    IndicatorID: 108,
    AreaCode: 'S1',
    Year: 2025,
    Month: -1,
    Quarter: -1,
    YearRange: 1,
    YearTypeID: 1,
    CIMethodID: 1,
    SexID: 4,
    AgeID: 1,
    CategoryTypeID: -1,
    CategoryID: -1,
    Value: 10,
    Count: 1,
    Denominator: 100,
    Denominator_2: null,
    LowerCI95: null,
    UpperCI95: null,
    LowerCI99_8: null,
    UpperCI99_8: null,
    ValueNoteId: 0,
    ...overrides,
  };
}
function observationOptions(): ObservationExportOptions {
  return {
    ...options,
    indicatorIds: new Set([108]),
    indicatorEnteredAt: new Map([[108, '2020-01-01T00:00:00.000Z']]),
    countIsNumerator: new Set(),
    areaIdByPholioCode: new Map([['S1', areaId('S1')]]),
    noteTypeCategory: new Map(),
    dimensionValueIds: new Set(),
    supersededSentinelIndicators: [],
  };
}

it.each([
  [{ AreaCode: 'missing' }, /unknown area missing/],
  [{ ValueNoteId: 99 }, /unknown note type 99/],
  [{ SexID: 3 }, /unknown dimension value/],
  [{ AgeID: 88 }, /unknown dimension value/],
  [{ AgeID: 209, SexID: -1 }, /compound age 209 with SexID -1, expected 4/],
  [{ AgeID: 212, SexID: 1 }, /compound age 212 with SexID 1, expected 4/],
])(
  'refuses unmapped source data before writing observation files (%j)',
  async (override, message) => {
    sourceObservations([observation(override)]);
    await expect(exportObservations(observationOptions())).rejects.toThrow(message);
    expect(await readdir(directory)).toEqual([]);
  },
);

it('excludes academic quarters when the source groupings publish annual data only', async () => {
  sourceObservations([observation({ YearTypeID: 3, Quarter: 1 })]);
  const result = await exportObservations(observationOptions());
  expect(result.observationExclusions.periodicity_not_in_grouping).toBe(1);
  expect(await rows('observation')).toEqual([]);
});
it('rejects the published zero-upper-limit defect before writing observations', async () => {
  sourceObservations([
    observation({
      uid: 1,
      LowerCI99_8: 89.88906373930455,
      UpperCI99_8: 0,
      Value: 90.85268000427945,
    }),
  ]);
  await expect(exportObservations(observationOptions())).rejects.toThrow(
    /uid 1, indicator 108, 99.8%: inverted/,
  );
  expect(await readdir(directory)).toEqual([]);
});
it.each(verifiedIntervals)(
  'exports the verified vaccination correction for $expected.uid',
  async (repair) => {
    const original = repair.expected;
    const source = observation({ ...original, YearTypeID: 2 });
    const groupings = [{ ...source, BaselineQuarter: -1, BaselineMonth: -1 }];
    sourceObservations([source], groupings);
    const input = observationOptions();
    input.indicatorSelection = { kind: 'approved', indicators: [original.IndicatorID] };
    input.indicatorIds = new Set([original.IndicatorID]);
    input.indicatorEnteredAt = new Map([[original.IndicatorID, '2020-01-01T00:00:00.000Z']]);
    input.areaIdByPholioCode = new Map([[original.AreaCode, areaId(original.AreaCode)]]);
    input.dimensionValueIds = new Set([
      sexDimensionValueId(original.SexID),
      ageDimensionValueId(original.AgeID),
    ]);
    const result = await exportObservations(input);
    expect((await rows('observation'))[0]).toMatchObject({
      lower_ci_998: String(original.LowerCI99_8),
      upper_ci_998: String(repair.corrected_upper_ci_998),
      lower_ci_95: String(original.LowerCI95),
      upper_ci_95: String(original.UpperCI95),
    });
    expect(result.observationCorrections).toEqual([
      {
        source_uid: original.uid,
        indicator_id: original.IndicatorID,
        field: 'UpperCI99_8',
        original_value: 0,
        corrected_value: repair.corrected_upper_ci_998,
        evidence_url: repair.evidence_url,
      },
    ]);
  },
);
it('refuses a verified interval repair when the source numerator changes', async () => {
  const repair = verifiedIntervals[0];
  sourceObservations([observation({ ...repair.expected, Count: repair.expected.Count + 1 })]);
  const input = observationOptions();
  input.indicatorSelection = { kind: 'approved', indicators: [repair.expected.IndicatorID] };
  await expect(exportObservations(input)).rejects.toThrow(
    'verified interval correction does not match source Count',
  );
  expect(await readdir(directory)).toEqual([]);
});
it('checks verified repairs again when source counts change after pre-flight', async () => {
  const repair = verifiedIntervals[0];
  const source = observation({ ...repair.expected });
  sourceObservations([source]);
  vi.mocked(streamPholio)
    .mockImplementationOnce(async (_pool, _query, consume) => {
      await consume(source);
      return 1;
    })
    .mockImplementationOnce(async (_pool, _query, consume) => {
      await consume({ ...source, Denominator: repair.expected.Denominator + 1 });
      return 1;
    });
  const input = observationOptions();
  input.indicatorSelection = { kind: 'approved', indicators: [repair.expected.IndicatorID] };
  input.indicatorIds = new Set([repair.expected.IndicatorID]);
  input.indicatorEnteredAt = new Map([[repair.expected.IndicatorID, '2020-01-01T00:00:00.000Z']]);
  input.areaIdByPholioCode = new Map([
    [repair.expected.AreaCode, areaId(repair.expected.AreaCode)],
  ]);
  input.dimensionValueIds = new Set([
    sexDimensionValueId(repair.expected.SexID),
    ageDimensionValueId(repair.expected.AgeID),
  ]);
  await expect(exportObservations(input)).rejects.toThrow(
    'verified interval correction does not match source Denominator',
  );
});
it('keeps numeric masking when a source note is recategorised as quality', async () => {
  sourceObservations([
    observation({ Value: -1, ValueNoteId: 305, Count: 3, Denominator: 10, Denominator_2: 8 }),
  ]);
  const input = observationOptions();
  input.noteTypeCategory = new Map([[305, 'quality']]);
  input.countIsNumerator = new Set([108]);
  await exportObservations(input);
  expect((await rows('observation'))[0]).toMatchObject({
    value: DATA_MIGRATION_NULL,
    count: DATA_MIGRATION_NULL,
    numerator: DATA_MIGRATION_NULL,
    denominator: DATA_MIGRATION_NULL,
    denominator_2: DATA_MIGRATION_NULL,
  });
});

it.each([
  { level: '95%', bounds: { LowerCI95: 12, UpperCI95: 8 } },
  { level: '99.8%', bounds: { LowerCI99_8: 12, UpperCI99_8: 8 } },
])(
  'reports source diagnostics for a $level interval changed after pre-flight',
  async ({ level, bounds }) => {
    sourceObservations([observation()]);
    vi.mocked(streamPholio)
      .mockImplementationOnce(async (_pool, _query, consume) => {
        await consume(observation());
        return 1;
      })
      .mockImplementationOnce(async (_pool, _query, consume) => {
        await consume(observation(bounds));
        return 1;
      });
    await expect(exportObservations(observationOptions())).rejects.toThrow(
      `CoreDataSet uid 1, indicator 108, ${level}: inverted`,
    );
  },
);

it('finishes writing its files before it reports a failure', async () => {
  sourceObservations([observation()]);
  vi.mocked(streamPholio)
    .mockImplementationOnce(async (_pool, _query, consume) => {
      await consume(observation());
      return 1;
    })
    .mockImplementationOnce(async (_pool, _query, consume) => {
      await consume(observation({ LowerCI95: 12, UpperCI95: 8 }));
      return 1;
    });

  await expect(exportObservations(observationOptions())).rejects.toThrow('inverted');

  expect(await rows('observation')).toEqual([]);
});

it('counts every intentional observation exclusion separately', async () => {
  sourceObservations([
    observation(),
    observation({ uid: 2, IndicatorID: 94204 }),
    observation({ uid: 3, IndicatorID: 109 }),
    observation({ uid: 4, ValueNoteId: 506 }),
    observation({ uid: 5, Value: -1, Count: -1, Denominator: -1 }),
    observation({ uid: 6, Year: 1899 }),
    observation({ uid: 7, IndicatorID: 110 }),
  ]);
  const input = observationOptions();
  input.indicatorSelection = { kind: 'approved', indicators: [108, 109] };
  input.excludedIndicators = [109];
  const result = await exportObservations(input);
  expect(result.observationExclusions).toEqual({
    test_indicator: 1,
    not_approved: 1,
    excluded_indicator: 1,
    note_506: 1,
    empty_observation: 1,
    year_before_1900: 1,
    year_range_not_in_grouping: 0,
    periodicity_not_in_grouping: 0,
    duplicate_not_in_grouping: 0,
    duplicate_identical: 0,
    duplicate_placeholder: 0,
    duplicate_superseded: 0,
  });
  expect((await rows('observation')).length).toBe(1);
  expect(result.sourceObservations).toBe(2);
  expect(result.scannedObservations).toBe(7);
  expect(result.excludedObservations).toBe(1);
});

it.each(['missing', 'extra'])('refuses an %s observation in the writing pass', async (change) => {
  sourceObservations([observation()]);
  const preflight = vi.mocked(streamPholio).getMockImplementation();
  vi.mocked(streamPholio).mockImplementation(async (pool, query, consume) => {
    if (query.includes('ORDER BY c.IndicatorID')) return preflight?.(pool, query, consume) ?? 0;
    if (change === 'missing') return 0;
    await consume(observation());
    await consume(observation({ uid: 2, Year: 2024 }));
    return 2;
  });
  await expect(exportObservations(observationOptions())).rejects.toThrow(
    'Observation accounting failed',
  );
});

it('keeps the benchmark exclusion count limited to otherwise eligible observations', async () => {
  sourceObservations([
    observation(),
    observation({ uid: 2, IndicatorID: 109 }),
    observation({ uid: 3, IndicatorID: 109, ValueNoteId: 506 }),
    observation({ uid: 4, IndicatorID: 109, Year: 1899 }),
  ]);
  const input = observationOptions();
  input.indicatorSelection = { kind: 'approved', indicators: [108, 109] };
  input.excludedIndicators = [109];
  const result = await exportObservations(input);
  expect(result.observationExclusions.excluded_indicator).toBe(1);
  expect(result.observationExclusions.note_506).toBe(1);
  expect(result.observationExclusions.year_before_1900).toBe(1);
});

it('retains observations whose sex is not applicable with their other dimensions', async () => {
  sourceObservations([observation({ SexID: -1, AgeID: 28 })]);
  const input = observationOptions();
  const ageValueId = ageDimensionValueId(28);
  input.dimensionValueIds = new Set([ageValueId]);

  await exportObservations(input);

  expect(await rows('observation')).toEqual([
    expect.objectContaining({ value: '10', dimension_key: String(ageValueId) }),
  ]);
  expect(await rows('observation_dimension')).toEqual([
    expect.objectContaining({ dimension_type_id: '2', dimension_value_id: String(ageValueId) }),
  ]);
});

it("writes Pholio's Count as the numerator of an indicator whose value type has one", async () => {
  sourceObservations([observation({ Count: 12 })]);
  const input = observationOptions();
  input.countIsNumerator = new Set([108]);

  await exportObservations(input);

  expect(await rows('observation')).toEqual([
    expect.objectContaining({ count: DATA_MIGRATION_NULL, numerator: '12' }),
  ]);
});

it("keeps Pholio's Count as the count of any other indicator", async () => {
  sourceObservations([observation({ Count: 12 })]);

  await exportObservations(observationOptions());

  expect(await rows('observation')).toEqual([
    expect.objectContaining({ count: '12', numerator: DATA_MIGRATION_NULL }),
  ]);
});

it('detects non-contiguous duplicate keys using the actual pre-flight', async () => {
  sourceObservations([
    observation(),
    observation({ uid: 2, IndicatorID: 109 }),
    observation({ uid: 5, Value: 11 }),
  ]);
  await expect(exportObservations(observationOptions())).rejects.toThrow(/CoreDataSet uids 1, 5/);
  expect(await readdir(directory)).toEqual([]);
});

it('keeps the persons row and drops its identical not-applicable twin', async () => {
  sourceObservations([observation({ uid: 1, SexID: -1 }), observation({ uid: 2, SexID: 4 })]);
  const result = await exportObservations(observationOptions());
  expect(await rows('observation')).toEqual([
    expect.objectContaining({ id: String(observationId(2)), value: '10' }),
  ]);
  expect(result.observationExclusions.duplicate_identical).toBe(1);
});

it('keeps the grouped series over an ungrouped placeholder', async () => {
  sourceObservations([
    observation({
      uid: 1,
      SexID: -1,
      AgeID: -1,
      Value: -1,
      Count: -1,
      Denominator: -1,
      ValueNoteId: 501,
    }),
    observation({ uid: 2 }),
  ]);
  const input = observationOptions();
  input.noteTypeCategory = new Map([[501, 'other']]);
  const result = await exportObservations(input);
  expect(await rows('observation')).toEqual([
    expect.objectContaining({ id: String(observationId(2)) }),
  ]);
  expect(await rows('observation_note')).toEqual([]);
  expect(result.observationExclusions.duplicate_not_in_grouping).toBe(1);
});

it('retains the published suppression instead of ungrouped value twins', async () => {
  sourceObservations([
    observation({ uid: 1, SexID: -1, YearRange: -1 }),
    observation({ uid: 2, SexID: 4, YearRange: -1 }),
    observation({ uid: 3, Value: -1, Count: -1, Denominator: -1, ValueNoteId: 305 }),
  ]);
  const input = observationOptions();
  input.noteTypeCategory = new Map([[305, 'disclosure']]);
  const result = await exportObservations(input);
  expect(await rows('observation')).toEqual([
    expect.objectContaining({ id: String(observationId(3)), value: DATA_MIGRATION_NULL }),
  ]);
  expect(await rows('observation_note')).toEqual([
    expect.objectContaining({ observation_id: String(observationId(3)), note_type_id: '305' }),
  ]);
  expect(result.observationExclusions.year_range_not_in_grouping).toBe(2);
});

it('retains a populated historical aggregate when its empty twin has the same geographic note', async () => {
  sourceObservations(
    [
      observation({
        uid: 1,
        SexID: -1,
        AgeID: -1,
        Value: -1,
        Count: -1,
        Denominator: -1,
        ValueNoteId: 501,
      }),
      observation({ uid: 2, Value: 595146, Count: 595146, Denominator: -1, ValueNoteId: 501 }),
    ],
    [
      {
        IndicatorID: 108,
        SexID: -1,
        AgeID: -1,
        YearRange: 1,
        BaselineQuarter: -1,
        BaselineMonth: -1,
      },
    ],
  );
  const input = observationOptions();
  input.noteTypeCategory = new Map([[501, 'geographic']]);
  const result = await exportObservations(input);
  expect(await rows('observation')).toEqual([
    expect.objectContaining({ id: String(observationId(2)), value: '595146' }),
  ]);
  expect(result.observationExclusions.duplicate_placeholder).toBe(1);
});

it.each(['disclosure', 'missing'])(
  'retains a grouped empty value carrying a %s note',
  async (category) => {
    sourceObservations(
      [
        observation({
          uid: 1,
          SexID: -1,
          AgeID: -1,
          Value: -1,
          Count: -1,
          Denominator: -1,
          ValueNoteId: 305,
        }),
        observation({ uid: 2, ValueNoteId: 305 }),
      ],
      [
        {
          IndicatorID: 108,
          SexID: -1,
          AgeID: -1,
          YearRange: 1,
          BaselineQuarter: -1,
          BaselineMonth: -1,
        },
      ],
    );
    const input = observationOptions();
    input.noteTypeCategory = new Map([[305, category]]);
    await exportObservations(input);
    expect(await rows('observation')).toEqual([
      expect.objectContaining({ id: String(observationId(1)), value: DATA_MIGRATION_NULL }),
    ]);
  },
);

it('retains published trust data when only England has a grouping', async () => {
  sourceObservations(
    [observation({ IndicatorID: 92275, AreaTypeID: 14, Year: 2017, SexID: 2, AgeID: 179 })],
    [
      {
        IndicatorID: 92275,
        AreaTypeID: 15,
        SexID: 2,
        AgeID: 179,
        YearRange: 1,
        BaselineQuarter: -1,
        BaselineMonth: -1,
      },
    ],
  );
  const input = observationOptions();
  input.indicatorSelection = { kind: 'approved', indicators: [92275] };
  input.indicatorIds = new Set([92275]);
  input.indicatorEnteredAt = new Map([[92275, '2020-01-01T00:00:00.000Z']]);
  input.dimensionValueIds = new Set([sexDimensionValueId(2), ageDimensionValueId(179)]);
  await exportObservations(input);
  expect(await rows('observation')).toEqual([
    expect.objectContaining({ value: '10', from_date: '2017-01-01' }),
  ]);
});

it('retains historical periods before the current grouping baseline', async () => {
  sourceObservations(
    [observation({ Year: 2010 })],
    [
      {
        IndicatorID: 108,
        SexID: 4,
        AgeID: 1,
        YearRange: 1,
        BaselineQuarter: -1,
        BaselineMonth: -1,
        BaselineYear: 2020,
        DataPointYear: 2025,
      },
    ],
  );
  await exportObservations(observationOptions());
  expect(await rows('observation')).toEqual([expect.objectContaining({ from_date: '2010-01-01' })]);
});

it('excludes quarter-coded uploads of an annual series before canonical keys collide', async () => {
  sourceObservations(
    [
      observation({ uid: 1, Quarter: 3, Value: 12 }),
      observation({ uid: 2, Quarter: 3, YearRange: 3, Value: 13 }),
      observation({ uid: 3, Value: 12 }),
      observation({ uid: 4, YearRange: 3, Value: 13 }),
    ],
    [1, 3].map((YearRange) => ({
      IndicatorID: 108,
      SexID: 4,
      AgeID: 1,
      YearRange,
      BaselineQuarter: -1,
      BaselineMonth: -1,
    })),
  );
  const result = await exportObservations(observationOptions());
  expect((await rows('observation')).map((row) => row.id)).toEqual([
    String(observationId(3)),
    String(observationId(4)),
  ]);
  expect(result.observationExclusions.periodicity_not_in_grouping).toBe(2);
  expect(result.sourceObservations).toBe(4);
});

it.each([
  [72.49, 72042.0954, 72939.9819],
  [33.33, 4.0368, 120.4115],
  [100, 99, 100.00000000000003],
  [0.5, -2, 1.2],
])('exports raw CI bounds unchanged for value %s', async (value, lower, upper) => {
  sourceObservations([
    observation({
      Value: value,
      LowerCI95: lower,
      UpperCI95: upper,
      LowerCI99_8: lower,
      UpperCI99_8: upper,
    }),
  ]);
  const result = await exportObservations(observationOptions());
  expect(await rows('observation')).toEqual([
    expect.objectContaining({
      value: String(value),
      lower_ci_95: String(lower),
      upper_ci_95: String(upper),
      lower_ci_998: String(lower),
      upper_ci_998: String(upper),
    }),
  ]);
  expect(result.excludedObservations).toBe(0);
});

it('keeps the grouped persons series when a not-applicable twin has conflicting values', async () => {
  sourceObservations([
    observation({ uid: 1, SexID: -1, Value: 66.66667, Count: 2, Denominator: 3 }),
    observation({ uid: 2, SexID: 4, Value: 26.52469, Count: 876891, Denominator: 3305943 }),
  ]);
  const result = await exportObservations(observationOptions());
  expect(await rows('observation')).toEqual([
    expect.objectContaining({ id: String(observationId(2)), value: '26.52469', count: '876891' }),
  ]);
  expect(result.observationExclusions.duplicate_not_in_grouping).toBe(1);
});

it('refuses twins whose measures differ unless the indicator is known to hold a stale copy', async () => {
  const source = [
    observation({ uid: 1, AgeID: -1, Value: 9 }),
    observation({ uid: 2, AgeID: 1 }),
    observation({ uid: 3, YearRange: -1, Value: 10.000001 }),
  ];
  sourceObservations(source, []);
  await expect(exportObservations(observationOptions())).rejects.toThrow(/CoreDataSet uids 1, 2/);
  expect(await readdir(directory)).toEqual([]);

  sourceObservations(source, []);
  const input = observationOptions();
  input.supersededSentinelIndicators = [108];
  const result = await exportObservations(input);
  expect(await rows('observation')).toEqual([
    expect.objectContaining({ id: String(observationId(2)), value: '10' }),
  ]);
  expect(result.observationExclusions.duplicate_superseded).toBe(2);
});

it('refuses to replace a grouped suppression with a conflicting grouped value', async () => {
  sourceObservations([
    observation({ uid: 1, Value: -1, Count: -1, Denominator: -1, ValueNoteId: 305 }),
    observation({ uid: 2 }),
  ]);
  const input = observationOptions();
  input.noteTypeCategory = new Map([[305, 'disclosure']]);
  await expect(exportObservations(input)).rejects.toThrow(/CoreDataSet uids 1, 2/);
  expect(await readdir(directory)).toEqual([]);
});

it('retains inequality breakdowns that do not have their own grouping', async () => {
  sourceObservations([observation({ SexID: 1, AgeID: 28 })]);
  const input = observationOptions();
  input.dimensionValueIds = new Set([sexDimensionValueId(1), ageDimensionValueId(28)]);
  await exportObservations(input);
  expect(await rows('observation')).toEqual([expect.objectContaining({ value: '10' })]);
});

it('retains a unique compound-age half when only the other half is duplicated', async () => {
  const source = [observation({ uid: 1, AgeID: 209 }), observation({ uid: 2, AgeID: 274 })];
  sourceObservations(
    source,
    [209, 274].map((AgeID) => ({
      IndicatorID: 108,
      SexID: 4,
      AgeID,
      YearRange: 1,
      BaselineQuarter: -1,
      BaselineMonth: -1,
    })),
  );
  const input = observationOptions();
  input.dimensionValueIds = new Set(
    source.flatMap((row) =>
      observationDimensions(row)
        .flat()
        .map((dimension) => dimension.valueId),
    ),
  );
  const result = await exportObservations(input);
  expect((await rows('observation')).map((row) => row.id)).toEqual([
    String(observationId(1, 0)),
    String(observationId(1, 1)),
    String(observationId(2, 1)),
  ]);
  expect(result.sourceObservations).toBe(4);
});

it('counts both compound-age observations before excluding their source period', async () => {
  sourceObservations([observation({ AgeID: 209, YearRange: -1 })]);
  const result = await exportObservations(observationOptions());
  expect(result.sourceObservations).toBe(2);
  expect(result.observationExclusions.year_range_not_in_grouping).toBe(2);
  expect(await rows('observation')).toEqual([]);
});

it('uses the same compound dimensions in canonical keys and written bridges', async () => {
  const source = observation({ AgeID: 209, SexID: 4 });
  sourceObservations([source]);
  const input = observationOptions();
  input.dimensionValueIds = new Set(
    observationDimensions(source)
      .flat()
      .map((d) => d.valueId),
  );
  await exportObservations(input);
  const observations = await rows('observation');
  const dimensions = await rows('observation_dimension');
  expect(observations.length).toBe(2);
  // The bridge has no id: its rows go in order of observation, then dimension type.
  expect(Object.keys(dimensions[0] ?? {})).toEqual([
    'observation_id',
    'dimension_value_id',
    'dimension_type_id',
  ]);
  expect(dimensions.map((row) => [row.observation_id, row.dimension_type_id])).toEqual(
    observations.flatMap((row) => [
      [row.id, '1'],
      [row.id, '2'],
    ]),
  );
  for (const row of observations) {
    const ids = dimensions
      .filter((d) => d.observation_id === row.id)
      .map((d) => Number(d.dimension_value_id))
      .sort((a, b) => a - b);
    expect(row.dimension_key).toBe(ids.join(','));
  }
  expect(dimensions.some((row) => row.dimension_value_id === String(sexDimensionValueId(1)))).toBe(
    true,
  );
  expect(dimensions.some((row) => row.dimension_value_id === String(sexDimensionValueId(2)))).toBe(
    true,
  );
});

function indicatorQueries(
  unitName = 'No unit',
  indicators = [108, 109].map((IndicatorID) => ({
    IndicatorID,
    Name: `Indicator ${IndicatorID}`,
  })),
  uploads: { IndicatorID: number; LastUploadedAt: Date }[] = [],
  metadata: {
    groupings?: Record<string, unknown>[];
    baselines?: Record<string, unknown>[];
    yearTypeId?: number | null;
    ownerProfileId?: number | null;
    formattingMaximum?: number | null;
    decimalPlaces?: number | null;
    confidenceLevel?: string | null;
    frequency?: string;
    frequencyProse?: string;
    frequencies?: { IndicatorID: number; FrequencyID: number | null; Name: string | null }[];
    ciMethodId?: number | null;
  } = {},
  profileMetadata: Record<string, unknown>[] = [],
) {
  vi.mocked(queryPholio)
    .mockResolvedValueOnce(
      metadata.groupings ??
        indicators.map(({ IndicatorID }) => ({
          IndicatorID,
          GroupID: 1,
          ProfileId: 10,
          PolarityID: 0,
          ComparatorMethodID: 1,
        })),
    )
    .mockResolvedValueOnce([
      { id: -1, name: 'Not applicable' },
      { id: 0, name: 'RAG - Low is good' },
      { id: 1, name: 'RAG - High is good' },
      { id: 99, name: 'BOB - Blue orange blue' },
    ])
    .mockResolvedValueOnce(
      metadata.frequencies ??
        (metadata.frequency
          ? [{ IndicatorID: 108, FrequencyID: 1, Name: metadata.frequency }]
          : []),
    )
    .mockResolvedValueOnce(
      indicators.map(({ IndicatorID }) => ({
        IndicatorID,
        ci_confidence_level:
          metadata.confidenceLevel === undefined ? '95' : metadata.confidenceLevel,
        FormattingMaximum: metadata.formattingMaximum ?? null,
      })),
    )
    .mockResolvedValueOnce([
      { id: 1, name: 'Wilson Score method' },
      { id: 2, name: "Byar's method" },
      { id: 8, name: "Byar's method (no small number correction)" },
      { id: 10, name: 'Unknown' },
    ])
    .mockResolvedValueOnce(
      indicators.map(({ IndicatorID, Name }) => ({
        IndicatorID,
        Name,
        ValueTypeName: 'Count',
        DecimalPlacesDisplayed: metadata.decimalPlaces ?? null,
        UnitName: unitName,
        YearTypeName: 'Calendar',
        YearTypeID: metadata.yearTypeId === undefined ? 1 : metadata.yearTypeId,
        OwnerProfileId: metadata.ownerProfileId === undefined ? 10 : metadata.ownerProfileId,
        CIMethodID: metadata.ciMethodId ?? null,
        EnteredAt: new Date('2020-01-01T00:00:00Z'),
      })),
    )
    .mockResolvedValueOnce(metadata.baselines ?? [])
    .mockResolvedValueOnce(uploads)
    .mockResolvedValueOnce([
      {
        IndicatorID: 108,
        Definition: 'aged <16 and >64, <b>high</b>',
        Rationale: null,
        Methodology: null,
        NumeratorDefinition: null,
        DenominatorDefinition: null,
        DataSourceID: null,
        NumeratorSourceID: null,
        DenominatorSourceID: null,
        DisclosureControl: null,
        Caveats: null,
        Notes: null,
        Frequency: metadata.frequencyProse ?? null,
      },
    ])
    .mockResolvedValueOnce(profileMetadata);
}
it.each([
  [
    'keeps a method the service lists',
    1,
    {
      ci_method_id: '1',
      has_ci_method_modifications: DATA_MIGRATION_NULL,
      ci_method_modifications_detail: DATA_MIGRATION_NULL,
    },
  ],
  [
    'leaves an unknown method unanswered',
    10,
    {
      ci_method_id: DATA_MIGRATION_NULL,
      has_ci_method_modifications: DATA_MIGRATION_NULL,
      ci_method_modifications_detail: DATA_MIGRATION_NULL,
    },
  ],
  [
    "writes Byar's method with no small number correction as Byar's method, modified",
    8,
    {
      ci_method_id: '2',
      has_ci_method_modifications: 't',
      ci_method_modifications_detail: 'No small number correction',
    },
  ],
])('%s', async (_, ciMethodId, expected) => {
  indicatorQueries(undefined, undefined, [], { ciMethodId });
  await exportIndicators(options);
  expect((await rows('indicator_version'))[0]).toMatchObject(expected);
});
it('exports only the approved indicators and uses plain text without damaging inequalities', async () => {
  indicatorQueries();
  const result = await exportIndicators(options);
  expect(result.indicatorIds).toEqual(new Set([108]));
  expect(result.excludedNonApprovedIndicators).toBe(1);
  expect((await rows('indicator_version'))[0]?.definition).toBe('aged <16 and >64, high');
});
it.each([
  [100, null],
  [9.99, null],
  [100, 2],
  [null, -1],
])(
  'preserves source formatting settings: maximum %s, override %s',
  async (maximum, decimalPlaces) => {
    indicatorQueries('No unit', undefined, [], { formattingMaximum: maximum, decimalPlaces });
    await exportIndicators(options);
    expect(JSON.parse((await rows('indicator_version'))[0]?.fingertips_formatting ?? '{}')).toEqual(
      {
        maximum,
        decimalPlaces,
      },
    );
  },
);

it('retains formatting limits even when the indicator has no confidence intervals', async () => {
  indicatorQueries('No unit', undefined, [], { formattingMaximum: 9.99, confidenceLevel: null });
  await exportIndicators(options);
  const [version] = await rows('indicator_version');
  expect(version?.ci_confidence_level).toBe(DATA_MIGRATION_NULL);
  expect(JSON.parse(version?.fingertips_formatting ?? '{}')).toEqual({
    maximum: 9.99,
    decimalPlaces: null,
  });
});

it('writes each exported version published and locked', async () => {
  indicatorQueries();
  await exportIndicators(options);
  expect((await rows('indicator_version'))[0]).toMatchObject({
    status: 'published',
    is_locked: 't',
  });
});
it('writes the indicator frequency from source prose', async () => {
  indicatorQueries('No unit', undefined, [], { frequencyProse: 'Quarterly' });
  await exportIndicators(options);
  expect((await rows('indicator_version'))[0]?.update_frequency).toBe('quarterly');
});
it('exports unrecognised source prose as an other frequency, whatever the lookup', async () => {
  indicatorQueries('No unit', undefined, [], {
    frequency: 'Annual',
    frequencyProse: 'The data will normally be updated annually.',
  });
  await exportIndicators(options);
  expect((await rows('indicator_version'))[0]).toMatchObject({
    update_frequency: 'other',
    update_frequency_text: 'The data will normally be updated annually.',
    update_frequency_years: DATA_MIGRATION_NULL,
  });
});
it('writes the number of years from source prose', async () => {
  indicatorQueries('No unit', undefined, [], { frequencyProse: 'Every 3 years' });
  await exportIndicators(options);
  expect((await rows('indicator_version'))[0]).toMatchObject({
    update_frequency: 'every-n-years',
    update_frequency_years: '3',
    update_frequency_text: DATA_MIGRATION_NULL,
  });
});
it.each([
  [
    'Annual measurements during the academic year.',
    'Annual measurements during the academic year.',
    'other',
  ],
  ['<p>Quarterly</p>', DATA_MIGRATION_NULL, 'quarterly'],
  [
    '<p>Academic year &amp; term time</p><p>Published in winter.</p>',
    'Academic year & term time\nPublished in winter.',
    'other',
  ],
  ['', DATA_MIGRATION_NULL, DATA_MIGRATION_NULL],
  ['  \n\t ', DATA_MIGRATION_NULL, DATA_MIGRATION_NULL],
  ['<p>&nbsp;</p>', DATA_MIGRATION_NULL, DATA_MIGRATION_NULL],
])(
  'writes frequency prose %j as the description of an other frequency alone',
  async (frequencyProse, text, frequency) => {
    indicatorQueries('No unit', undefined, [], { frequencyProse });
    await exportIndicators(options);
    expect((await rows('indicator_version'))[0]).toMatchObject({
      update_frequency_text: text,
      update_frequency: frequency,
    });
  },
);
it('leaves missing indicator frequency unanswered', async () => {
  indicatorQueries();
  await exportIndicators(options);
  expect((await rows('indicator_version'))[0]).toMatchObject({
    update_frequency: DATA_MIGRATION_NULL,
    update_frequency_text: DATA_MIGRATION_NULL,
  });
});
it.each([
  ['Quarterly', 'quarterly'],
  ['The data will normally be updated annually.', 'other'],
  [undefined, DATA_MIGRATION_NULL],
])('allows a null structured frequency with prose %s', async (frequencyProse, expected) => {
  indicatorQueries('No unit', undefined, [], {
    frequencies: [{ IndicatorID: 108, FrequencyID: null, Name: null }],
    ...(frequencyProse === undefined ? {} : { frequencyProse }),
  });
  await exportIndicators(options);
  expect((await rows('indicator_version'))[0]?.update_frequency).toBe(expected);
});
it.each(['approved', 'development-snapshot'] as const)(
  'ignores unknown frequency lookups outside the %s export selection',
  async (kind) => {
    indicatorQueries('No unit', undefined, [], {
      frequencies: [{ IndicatorID: 109, FrequencyID: 999, Name: null }],
    });
    if (kind === 'development-snapshot') {
      options.indicatorSelection = { kind };
      options.excludedIndicators = [109];
    }
    const result = await exportIndicators(options);
    expect(result.indicatorIds).toEqual(new Set([108]));
  },
);
it.each(['approved', 'development-snapshot'] as const)(
  'rejects unknown frequency lookups in the %s export selection before writing',
  async (kind) => {
    indicatorQueries('No unit', undefined, [], {
      frequencies: [{ IndicatorID: 108, FrequencyID: 999, Name: null }],
    });
    if (kind === 'development-snapshot') options.indicatorSelection = { kind };
    await expect(exportIndicators(options)).rejects.toThrow('Indicator 108: unknown frequency 999');
    expect(await readdir(directory)).toEqual([]);
  },
);
it.each(['Monthly', 'The data will be updated monthly.'])(
  'refuses contradictory source frequency %s before writing indicator tables',
  async (frequencyProse) => {
    indicatorQueries('No unit', undefined, [], {
      frequency: 'Annual',
      frequencyProse,
    });
    await expect(exportIndicators(options)).rejects.toThrow(
      'Conflicting source update frequencies',
    );
    expect(await readdir(directory)).toEqual([]);
  },
);
it('writes the owning profile polarity and comparator instead of the other profile', async () => {
  indicatorQueries('No unit', undefined, [], {
    ownerProfileId: 10,
    groupings: [
      { IndicatorID: 108, GroupID: 1, ProfileId: 10, PolarityID: 0, ComparatorMethodID: 1 },
      { IndicatorID: 108, GroupID: 2, ProfileId: 20, PolarityID: 1, ComparatorMethodID: 2 },
    ],
  });
  await exportIndicators(options);
  expect((await rows('indicator_version'))[0]).toMatchObject({
    polarity: 'lower-is-better',
    comparator_method_id: '1',
  });
});
it.each([
  { ownerProfileId: null, groupings: [], error: 'no owning profile' },
  { ownerProfileId: 10, groupings: [], error: 'no groupings for owning profile 10' },
  {
    ownerProfileId: 10,
    groupings: [
      { IndicatorID: 108, GroupID: 1, ProfileId: 10, PolarityID: null, ComparatorMethodID: 1 },
    ],
    error: 'missing polarity in owning profile 10',
  },
])('rejects missing analytical settings before writing: $error', async (metadata) => {
  indicatorQueries('No unit', undefined, [], metadata);
  await expect(exportIndicators(options)).rejects.toThrow(`Indicator 108: ${metadata.error}`);
  expect(await readdir(directory)).toEqual([]);
});
it('preserves an all-not-applicable source polarity', async () => {
  indicatorQueries('No unit', undefined, [], {
    ownerProfileId: 10,
    groupings: [
      { IndicatorID: 108, GroupID: 1, ProfileId: 10, PolarityID: -1, ComparatorMethodID: -1 },
    ],
  });
  await exportIndicators(options);
  expect((await rows('indicator_version'))[0]?.polarity).toBe('no-comparison-possible');
});
it('preserves profile references and raw frequency text in source provenance', async () => {
  indicatorQueries(
    'No unit',
    undefined,
    [],
    { frequency: 'Annual', frequencyProse: 'Every 3 years' },
    [
      {
        IndicatorID: 108,
        ProfileId: 10,
        Name: 'B03 - Indicator 108',
        Frequency: 'Every 3 years',
        StructuredFrequency: 'Annual',
      },
      {
        IndicatorID: 109,
        ProfileId: 20,
        Name: 'Unselected',
        Frequency: 'Monthly',
        StructuredFrequency: null,
      },
    ],
  );
  const result = await exportIndicators(options);
  expect(result.profileMetadata).toEqual([
    {
      indicator_id: 108,
      profile_id: 10,
      name: 'B03 - Indicator 108',
      frequency: 'Every 3 years',
      structured_frequency: 'Annual',
    },
  ]);
  expect((await rows('indicator_version'))[0]).toMatchObject({
    name: 'Indicator 108',
    update_frequency: 'every-n-years',
    update_frequency_years: '3',
  });
});
it.each(['approved', 'development-snapshot'] as const)(
  'exports the source upload date independently of creation time for %s',
  async (kind) => {
    const uploadedAt = '2026-04-29T12:05:00.000Z';
    indicatorQueries('No unit', undefined, [
      { IndicatorID: 108, LastUploadedAt: new Date(uploadedAt) },
      { IndicatorID: 109, LastUploadedAt: new Date('2026-05-01T09:30:00Z') },
    ]);
    options.indicatorSelection = kind === 'approved' ? { kind, indicators: [108] } : { kind };
    await exportIndicators(options);
    expect((await rows('indicator')).find(({ id }) => id === '108')).toMatchObject({
      created_at: '2020-01-01T00:00:00.000Z',
      data_updated_at: uploadedAt,
    });
  },
);

it('leaves the update date unknown when the source has no successful upload', async () => {
  indicatorQueries();
  await exportIndicators(options);
  expect((await rows('indicator'))[0]?.data_updated_at).toBe(DATA_MIGRATION_NULL);
});

it('refuses an approved indicator absent from the source', async () => {
  indicatorQueries();
  options.indicatorSelection = { kind: 'approved', indicators: [110] };
  await expect(exportIndicators(options)).rejects.toThrow(/110/);
  expect(await readdir(directory)).toEqual([]);
});

it('retains all six colliding datasets with distinct migration names and original ids', async () => {
  const names = [
    [90366, 'Life expectancy at birth'],
    [93283, 'Life expectancy at birth'],
    [90776, 'Chlamydia detection rate per 100,000 aged 15 to 24 years'],
    [91514, 'Chlamydia detection rate per 100,000 aged 15 to 24 years'],
    [93280, 'Fuel poverty (low income, low energy efficiency methodology)'],
    [93759, 'Fuel poverty (low income, low energy efficiency methodology)'],
  ] as const;
  indicatorQueries(
    'No unit',
    names.map(([IndicatorID, Name]) => ({ IndicatorID, Name })),
  );
  options.indicatorSelection = { kind: 'approved', indicators: names.map(([id]) => id) };
  const result = await exportIndicators(options);
  const versions = await rows('indicator_version');
  expect(result.indicatorIds).toEqual(new Set(names.map(([id]) => id)));
  expect(() =>
    checkSlugs(versions.map(({ id, name }) => ({ id: id ?? '', name: name ?? '' }))),
  ).not.toThrow();
  expect(versions.find(({ id }) => id === '90776')?.name).toContain('(Females)');
  expect(versions.find(({ id }) => id === '91514')?.name).toContain('(Males and total population)');
  expect(
    result.indicatorNameMappings.map(({ fingertipsId, sourceName }) => [fingertipsId, sourceName]),
  ).toEqual(names);
});

it('requires a new review when a provisionally renamed source name changes', async () => {
  indicatorQueries('No unit', [{ IndicatorID: 90366, Name: 'A changed source name' }]);
  options.indicatorSelection = { kind: 'approved', indicators: [90366] };
  await expect(exportIndicators(options)).rejects.toThrow(/90366: source name changed/);
  expect(await readdir(directory)).toEqual([]);
});

it.each(['', ' ', 'mean dmft per child'])(
  'refuses an approved unit the export cannot read before writing tables (%j)',
  async (unitName) => {
    indicatorQueries(unitName);
    await expect(exportIndicators(options)).rejects.toThrow(/Cannot translate units/);
    expect(await readdir(directory)).toEqual([]);
  },
);

it('sorts comparator gap-fill rows together with existing lookup IDs', async () => {
  vi.mocked(queryPholio)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      { ComparatorMethodID: 1, ComparatorMethod: 'One' },
      { ComparatorMethodID: 3, ComparatorMethod: 'Three' },
    ])
    .mockResolvedValueOnce([{ ComparatorMethodID: 2 }, { ComparatorMethodID: 3 }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
  await exportLookups(options);
  expect(await rows('comparator_method')).toEqual([
    { id: '1', name: 'One' },
    { id: '2', name: 'Legacy comparator method 2' },
    { id: '3', name: 'Three' },
  ]);
});

it('rejects an unreviewed disclosure note masking policy', async () => {
  vi.mocked(queryPholio)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      { ValueNoteID: 999, Text: 'Value suppressed to protect confidentiality' },
    ]);
  await expect(exportLookups(options)).rejects.toThrow(
    'Source note 999 requires review of its numeric masking policy',
  );
});

const invertedIntervalSamples = [
  ...new Map(publishedInvertedIntervals.map((entry) => [entry.IndicatorID, entry])).values(),
];
it.each(invertedIntervalSamples)(
  'exports the published inverted interval for indicator $IndicatorID as the source has it',
  async (entry) => {
    const source = observation({ ...entry });
    const groupings = [{ ...source, BaselineQuarter: -1, BaselineMonth: -1 }];
    sourceObservations([source], groupings);
    const input = observationOptions();
    input.indicatorSelection = { kind: 'approved', indicators: [entry.IndicatorID] };
    input.indicatorIds = new Set([entry.IndicatorID]);
    input.indicatorEnteredAt = new Map([[entry.IndicatorID, '2020-01-01T00:00:00.000Z']]);
    input.areaIdByPholioCode = new Map([[entry.AreaCode, areaId(entry.AreaCode)]]);
    input.dimensionValueIds = new Set([
      sexDimensionValueId(entry.SexID),
      ageDimensionValueId(entry.AgeID),
    ]);
    const result = await exportObservations(input);
    expect((await rows('observation'))[0]).toMatchObject({
      value: String(entry.Value),
      lower_ci_95: String(entry.LowerCI95),
      upper_ci_95: String(entry.UpperCI95),
    });
    expect(result.observationCorrections).toEqual([]);
  },
);
it('refuses a published inverted interval when the source limits change', async () => {
  const entry = publishedInvertedIntervals[0];
  const source = observation({ ...entry, UpperCI95: entry.UpperCI95 - 0.5 });
  sourceObservations([source], [{ ...source, BaselineQuarter: -1, BaselineMonth: -1 }]);
  const input = observationOptions();
  input.indicatorSelection = { kind: 'approved', indicators: [entry.IndicatorID] };
  input.indicatorIds = new Set([entry.IndicatorID]);
  input.indicatorEnteredAt = new Map([[entry.IndicatorID, '2020-01-01T00:00:00.000Z']]);
  input.areaIdByPholioCode = new Map([[entry.AreaCode, areaId(entry.AreaCode)]]);
  await expect(exportObservations(input)).rejects.toThrow(
    'published inverted interval does not match source UpperCI95',
  );
  expect(await readdir(directory)).toEqual([]);
});

it('exports the earliest grouping baseline as version metadata and keeps observation files separate', async () => {
  indicatorQueries('No unit', undefined, [], {
    yearTypeId: 10,
    baselines: [
      { IndicatorID: 108, BaselineYear: 2022, BaselineQuarter: 1, BaselineMonth: -1, YearRange: 5 },
    ],
  });
  await exportIndicators(options);
  expect((await rows('indicator_version'))[0]?.published_from).toBe('2022-04-01');
});

it('exports a null start date without grouping baselines', async () => {
  indicatorQueries();
  await exportIndicators(options);
  expect((await rows('indicator_version'))[0]?.published_from).toBe(DATA_MIGRATION_NULL);
});

it('exports convertible baselines and diagnostics without aborting the indicator', async () => {
  const invalid = {
    GroupingID: 42,
    IndicatorID: 108,
    SexID: 4,
    AgeID: 1,
    BaselineYear: 2000,
    BaselineQuarter: 1,
    BaselineMonth: -1,
    YearRange: 1,
  };
  indicatorQueries('No unit', undefined, [], {
    yearTypeId: 3,
    baselines: [invalid, { ...invalid, GroupingID: 43, BaselineYear: 2021, BaselineQuarter: -1 }],
  });
  const result = await exportIndicators(options);
  expect((await rows('indicator_version'))[0]?.published_from).toBe('2021-09-01');
  expect(result.groupingBaselineExclusions).toEqual([
    {
      indicator_id: 108,
      grouping: invalid,
      year_type_id: 3,
      reason: 'Academic quarters require a verified source date mapping',
    },
  ]);
});

it('exports a null cutoff when every baseline is unconvertible', async () => {
  indicatorQueries('No unit', undefined, [], {
    yearTypeId: 3,
    baselines: [
      {
        GroupingID: 42,
        IndicatorID: 108,
        BaselineYear: 2000,
        BaselineQuarter: 1,
        BaselineMonth: -1,
        YearRange: 1,
      },
    ],
  });
  const result = await exportIndicators(options);
  expect((await rows('indicator_version'))[0]?.published_from).toBe(DATA_MIGRATION_NULL);
  expect(result.groupingBaselineExclusions).toHaveLength(1);
});

it('aligns a null source year type baseline with observation dates', async () => {
  indicatorQueries('No unit', undefined, [], {
    yearTypeId: null,
    baselines: [
      {
        GroupingID: 42,
        IndicatorID: 108,
        BaselineYear: 2021,
        BaselineQuarter: -1,
        BaselineMonth: -1,
        YearRange: 1,
      },
    ],
  });
  await exportIndicators(options);
  const publishedFrom = (await rows('indicator_version'))[0]?.published_from;
  sourceObservations([observation({ YearTypeID: null, Year: 2021 })]);
  await exportObservations(observationOptions());
  expect(publishedFrom).toBe('2021-01-01');
  expect((await rows('observation'))[0]?.from_date).toBe(publishedFrom);
});

it.each([
  {
    name: 'a quarterly format on an annual-only indicator',
    grouping: { YearRange: 1, BaselineQuarter: -1 },
    row: { YearRange: 1, Quarter: 1 },
    reason: 'periodicity_not_in_grouping',
  },
  {
    name: 'a retired annual range on an annual-only indicator',
    grouping: { YearRange: 1, BaselineQuarter: -1 },
    row: { YearRange: 5 },
    reason: 'year_range_not_in_grouping',
  },
  {
    name: 'annual history for another sex',
    grouping: { SexID: 1 },
    row: { YearRange: 1 },
    reason: 'year_range_not_in_grouping',
  },
  {
    name: 'annual history for another age',
    grouping: { AgeID: 28 },
    row: { YearRange: 1 },
    reason: 'year_range_not_in_grouping',
  },
  {
    name: 'a quarterly range outside the cumulative series',
    grouping: {},
    row: { YearRange: 3, Quarter: 1 },
    reason: 'year_range_not_in_grouping',
  },
  {
    name: 'a multi-year annual range outside the cumulative series',
    grouping: {},
    row: { YearRange: 3 },
    reason: 'year_range_not_in_grouping',
  },
  {
    name: 'a monthly format outside the cumulative series',
    grouping: {},
    row: { YearRange: 5, Month: 1 },
    reason: 'periodicity_not_in_grouping',
  },
] as const)('excludes $name', async ({ grouping, row, reason }) => {
  sourceObservations(
    [observation({ YearTypeID: 10, ...row })],
    [
      {
        IndicatorID: 108,
        SexID: 4,
        AgeID: 1,
        YearRange: 5,
        BaselineYear: 2022,
        BaselineQuarter: 1,
        BaselineMonth: -1,
        ...grouping,
      },
    ],
  );
  // The export refuses a grouping whose sex or age it has no dimension value for.
  const result = await exportObservations({
    ...observationOptions(),
    dimensionValueIds: new Set([sexDimensionValueId(1), ageDimensionValueId(28)]),
  });
  expect(result.observationExclusions[reason]).toBe(1);
  expect(await rows('observation')).toEqual([]);
});

it('exports cumulative endpoints as one baseline series and retains its annual source rows', async () => {
  sourceObservations(
    [
      ...[1, 2, 4, 6, 17].map((quarter) =>
        observation({
          uid: quarter,
          Year: 2022,
          Quarter: quarter,
          YearRange: 5,
          YearTypeID: 10,
        }),
      ),
      observation({ uid: 30, Year: 2022, YearRange: 1, YearTypeID: 10 }),
      observation({ uid: 31, Year: 2023, Quarter: 1, YearRange: 5, YearTypeID: 10 }),
      observation({ uid: 32, Year: 2017, Quarter: 20, YearRange: 5, YearTypeID: 10 }),
      observation({ uid: 33, Year: 2022, YearRange: 5, YearTypeID: 10 }),
    ],
    [
      {
        IndicatorID: 108,
        SexID: 4,
        AgeID: 1,
        YearRange: 5,
        BaselineYear: 2022,
        BaselineQuarter: 1,
        BaselineMonth: -1,
      },
    ],
  );
  const result = await exportObservations(observationOptions());
  const exported = await rows('observation');
  expect(result.tables.observation.rows).toBe(9);
  expect(exported.slice(0, 5).map((row) => row.period_type)).toEqual(
    Array(5).fill('cumulative-quarter-2022-04-01'),
  );
  expect(exported.map((row) => row.to_date)).toEqual([
    '2022-06-30',
    '2022-09-30',
    '2023-03-31',
    '2023-09-30',
    '2026-06-30',
    '2023-03-31',
    '2023-06-30',
    '2022-03-31',
    '2027-03-31',
  ]);
  expect(exported.slice(5).map((row) => row.period_type)).toEqual([
    DATA_MIGRATION_NULL,
    'cumulative-quarter-2023-04-01',
    'cumulative-quarter-2017-04-01',
    DATA_MIGRATION_NULL,
  ]);
  expect(exported.map((row) => row.is_current_series)).toEqual([
    't',
    't',
    't',
    't',
    't',
    't',
    'f',
    'f',
    't',
  ]);
});

it.each([
  { year: 2021, annualGrouping: false },
  { year: 2021, annualGrouping: true },
  { year: 2023, annualGrouping: false },
  { year: 2023, annualGrouping: true },
])(
  'retains cumulative and annual twins outside the published baseline ($year, annual grouping: $annualGrouping)',
  async ({ year, annualGrouping }) => {
    const grouping = {
      IndicatorID: 108,
      SexID: 4,
      AgeID: 1,
      YearRange: 5,
      BaselineYear: 2022,
      BaselineQuarter: 1,
      BaselineMonth: -1,
    };
    sourceObservations(
      [
        observation({ uid: 1, Year: 2022, Quarter: 1, YearRange: 5, YearTypeID: 10 }),
        observation({ uid: 2, Year: year, Quarter: 4, YearRange: 5, YearTypeID: 10, Value: 7 }),
        observation({ uid: 3, Year: year, YearRange: 1, YearTypeID: 10, Value: 99 }),
      ],
      [grouping, ...(annualGrouping ? [{ ...grouping, YearRange: 1, BaselineQuarter: -1 }] : [])],
    );
    const result = await exportObservations(observationOptions());
    expect(result.tables.observation.rows).toBe(3);
    expect(result.excludedObservations).toBe(0);
    expect(await rows('observation')).toMatchObject([
      { period_type: 'cumulative-quarter-2022-04-01', is_current_series: 't' },
      {
        from_date: `${year}-04-01`,
        to_date: `${year + 1}-03-31`,
        period_type: `cumulative-quarter-${year}-04-01`,
        is_current_series: 'f',
        value: '7',
      },
      {
        from_date: `${year}-04-01`,
        to_date: `${year + 1}-03-31`,
        period_type: DATA_MIGRATION_NULL,
        is_current_series: 't',
        value: '99',
      },
    ]);
  },
);

it('exports only the published age tuples for 90799 while retaining all six observation ages', async () => {
  const ages = [168, 27, 28, 29, 30, 31];
  const source = ages.map((AgeID, index) =>
    observation({ IndicatorID: 90799, uid: index + 1, AgeID }),
  );
  const published = [168, 27].map((AgeID) => ({
    IndicatorID: 90799,
    SexID: 4,
    AgeID,
    YearRange: 1,
    BaselineQuarter: -1,
    BaselineMonth: -1,
  }));
  sourceObservations(source, [...published, ...published, { ...published[0], IndicatorID: 99999 }]);
  const context = {
    ...observationOptions(),
    indicatorSelection: { kind: 'approved' as const, indicators: [90799] },
    indicatorIds: new Set([90799]),
    indicatorEnteredAt: new Map([[90799, '2020-01-01T00:00:00.000Z']]),
    dimensionValueIds: new Set(ages.map(ageDimensionValueId)),
  };
  await exportObservations(context);
  expect(await rows('observation')).toHaveLength(6);
  const tuples = await rows('indicator_grouping');
  expect(tuples).toHaveLength(2);
  expect(tuples.map((row) => row.age_id).sort()).toEqual(
    [27, 168].map((age) => String(ageDimensionValueId(age))).sort(),
  );
  expect(
    tuples.every(
      (row) =>
        row.sex_id === DATA_MIGRATION_NULL &&
        row.period_kind === 'annual' &&
        row.year_range === '1',
    ),
  ).toBe(true);
});

it('preserves published period shapes and splits compound ages using the observation mapping', async () => {
  const grouping = {
    IndicatorID: 108,
    SexID: 4,
    AgeID: 212,
    YearRange: 1,
    BaselineQuarter: -1,
    BaselineMonth: -1,
  };
  sourceObservations(
    [],
    [
      grouping,
      { ...grouping, BaselineQuarter: 1 },
      { ...grouping, BaselineMonth: 1 },
      { ...grouping, YearRange: 3 },
    ],
  );
  const context = observationOptions();
  context.dimensionValueIds = new Set([
    sexDimensionValueId(1),
    sexDimensionValueId(2),
    compoundAgeDimensionValueId(212, 'M'),
    compoundAgeDimensionValueId(212, 'F'),
  ]);
  await exportObservations(context);
  const tuples = await rows('indicator_grouping');
  expect(tuples).toHaveLength(8);
  expect(new Set(tuples.map((row) => `${row.period_kind}:${row.year_range}`))).toEqual(
    new Set(['annual:1', 'annual:3', 'monthly:1', 'quarterly:1']),
  );
  for (const row of tuples) {
    const sex = row.sex_id === String(sexDimensionValueId(1)) ? 'M' : 'F';
    expect(row.age_id).toBe(String(compoundAgeDimensionValueId(212, sex)));
  }
});

it('rejects a missing grouping dimension before creating any output files', async () => {
  sourceObservations(
    [],
    [
      {
        IndicatorID: 108,
        SexID: 4,
        AgeID: 28,
        YearRange: 1,
        BaselineQuarter: -1,
        BaselineMonth: -1,
      },
    ],
  );
  await expect(exportObservations(observationOptions())).rejects.toThrow(
    `Grouping for 108 references missing dimension ${ageDimensionValueId(28)}`,
  );
  expect(await readdir(directory)).toEqual([]);
});

it.each([{ yearRanges: [-1] }, { yearRanges: [1] }, { yearRanges: [-1, 1] }])(
  'exports one canonical one-year grouping for source year ranges $yearRanges',
  async ({ yearRanges }) => {
    sourceObservations(
      yearRanges.map((YearRange, index) =>
        observation({ uid: index + 1, YearRange, Year: 2023 + index }),
      ),
      yearRanges.map((YearRange) => ({
        IndicatorID: 108,
        SexID: 4,
        AgeID: 1,
        YearRange,
        BaselineQuarter: -1,
        BaselineMonth: -1,
      })),
    );
    await exportObservations(observationOptions());
    expect(await rows('indicator_grouping')).toEqual([
      {
        id: String(indicatorGroupingId(JSON.stringify([108, null, null, 1, 'annual']))),
        indicator_id: '108',
        sex_id: DATA_MIGRATION_NULL,
        age_id: DATA_MIGRATION_NULL,
        year_range: '1',
        period_kind: 'annual',
      },
    ]);
    expect(
      (await rows('observation')).map(({ from_date, to_date }) => [from_date, to_date]),
    ).toEqual(yearRanges.map((_, index) => [`${2023 + index}-01-01`, `${2023 + index}-12-31`]));
  },
);
