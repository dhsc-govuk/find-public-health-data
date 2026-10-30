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
import { ageDimensionValueId, areaId, observationId, sexDimensionValueId } from './ids.ts';
import { exportIndicators } from './indicators.ts';
import { exportLookups } from './lookups.ts';
import { exportObservations, observationDimensions } from './observations.ts';
import { queryPholio, streamPholio } from './source.ts';

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
) {
  vi.mocked(queryPholio)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ id: 1, name: 'Not applicable' }])
    .mockResolvedValueOnce([{ id: 1, name: 'Annual' }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(
      indicators.map(({ IndicatorID, Name }) => ({
        IndicatorID,
        Name,
        ValueTypeName: 'Count',
        UnitName: unitName,
        YearTypeName: 'Calendar',
        CIMethodID: null,
        EnteredAt: new Date('2020-01-01T00:00:00Z'),
      })),
    )
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
      },
    ]);
}
it('exports only the approved indicators and uses plain text without damaging inequalities', async () => {
  indicatorQueries();
  const result = await exportIndicators(options);
  expect(result.indicatorIds).toEqual(new Set([108]));
  expect(result.excludedNonApprovedIndicators).toBe(1);
  expect((await rows('indicator_version'))[0]?.definition).toBe('aged <16 and >64, high');
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

it.each(['', ' '])(
  'refuses an unmappable approved unit before writing tables (%j)',
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
