import type { ObservationExportOptions } from './context.ts';
import { ageValueIdForObservation, sexValueIdForObservation } from './dimensions.ts';
import {
  type GroupingExclusion,
  loadObservationGroupings,
  type ObservationGroupings,
} from './groupings.ts';
import {
  AGE_DIMENSION_TYPE_ID,
  categoryDimensionTypeId,
  categoryDimensionValueId,
  DIMENSION_SLOTS,
  observationDimensionId,
  observationId,
  observationNoteId,
  SEX_DIMENSION_TYPE_ID,
  sourceUidForObservationId,
} from './ids.ts';
import { suppressSourceMeasures } from './note-suppression.ts';
import { computeDates } from './period.ts';
import { queryPholio, streamPholio } from './source.ts';
import { TableWriter } from './table-writer.ts';

// ─── Sentinel / CI helpers ────────────────────────────────────────────────────

/** -1 is Pholio's null sentinel for numeric fields. */
export function nullIfSentinel(v: number | null): number | null {
  if (v === null || v === -1) return null;
  return v;
}

/** Pholio's one Count, as the numerator of an indicator whose value type has one, else the count. */
export function countAndNumerator(
  count: number | null,
  isNumerator: boolean,
): { count: number | null; numerator: number | null } {
  return isNumerator ? { count: null, numerator: count } : { count, numerator: null };
}

/**
 * denominator_2 is only stored when it differs from denominator (before sentinel removal).
 * Reproduces: CASE WHEN c.Denominator_2 != c.Denominator THEN NULLIF(c.Denominator_2,-1) ELSE NULL END
 */
export function computeDenominator2(
  denominator2Raw: number | null,
  denominatorRaw: number | null,
): number | null {
  if (denominator2Raw === null) return null;
  if (denominator2Raw === denominatorRaw) return null;
  return nullIfSentinel(denominator2Raw);
}

export function computeCiPair(
  valueRaw: number | null,
  lowerRaw: number | null,
  upperRaw: number | null,
  source = 'Confidence interval',
): { lower: number | null; upper: number | null } {
  if (nullIfSentinel(valueRaw) === null) return { lower: null, upper: null };
  const lower = nullIfSentinel(lowerRaw);
  const upper = nullIfSentinel(upperRaw);
  if (lower !== null && upper !== null && lower > upper)
    throw new Error(
      `${source}: inverted confidence limits ${lower} > ${upper}; source correction required`,
    );
  return { lower, upper };
}

// ─── Compound sex+age ─────────────────────────────────────────────────────────

/** AgeIDs that decompose into a male+female pair of observation rows. */
export const COMPOUND_AGE_IDS = new Set([209, 212, 274]);

// ─── Dedup key ────────────────────────────────────────────────────────────────

/** Canonical observation identity within an indicator batch. */
export function dedupKey(
  indicatorId: number,
  areaId: number,
  fromDate: string,
  toDate: string,
  batchId: number,
  sortedDimValueIds: readonly number[],
): string {
  return `${indicatorId}|${areaId}|${fromDate}|${toDate}|${batchId}|${sortedDimValueIds.join(',')}`;
}

// ─── CoreDataSet row type ──────────────────────────────────────────────────────

interface CdsRow {
  uid: number;
  IndicatorID: number;
  AreaCode: string;
  Year: number;
  Month: number;
  Quarter: number;
  YearRange: number;
  YearTypeID: number | null;
  SexID: number;
  AgeID: number;
  CategoryTypeID: number;
  CategoryID: number;
  Value: number | null;
  Count: number | null;
  Denominator: number | null;
  Denominator_2: number | null;
  LowerCI95: number | null;
  UpperCI95: number | null;
  LowerCI99_8: number | null;
  UpperCI99_8: number | null;
  ValueNoteId: number;
}

interface ObservationDimension {
  slot: (typeof DIMENSION_SLOTS)[keyof typeof DIMENSION_SLOTS];
  typeId: number;
  valueId: number;
}

export function observationDimensions(
  c: Pick<CdsRow, 'SexID' | 'AgeID' | 'CategoryTypeID' | 'CategoryID'>,
): ObservationDimension[][] {
  const sexes = COMPOUND_AGE_IDS.has(c.AgeID) && c.SexID === 4 ? [1, 2] : [c.SexID];
  return sexes.map((sex) => {
    const dimensions: ObservationDimension[] = [];
    const sexValue = sexValueIdForObservation(sex);
    const ageValue = ageValueIdForObservation(
      c.AgeID,
      sexes.length === 2 ? (sex === 1 ? 'M' : 'F') : null,
    );
    if (sexValue !== null)
      dimensions.push({
        slot: DIMENSION_SLOTS.sex,
        typeId: SEX_DIMENSION_TYPE_ID,
        valueId: sexValue,
      });
    if (ageValue !== null)
      dimensions.push({
        slot: DIMENSION_SLOTS.age,
        typeId: AGE_DIMENSION_TYPE_ID,
        valueId: ageValue,
      });
    if (c.CategoryTypeID !== -1 && c.CategoryID !== -1)
      dimensions.push({
        slot: DIMENSION_SLOTS.category,
        typeId: categoryDimensionTypeId(c.CategoryTypeID),
        valueId: categoryDimensionValueId(c.CategoryTypeID, c.CategoryID),
      });
    return dimensions.sort((a, b) => a.valueId - b.valueId);
  });
}

export type ObservationExclusions = Record<
  | 'not_approved'
  | 'test_indicator'
  | 'excluded_indicator'
  | 'note_506'
  | 'empty_observation'
  | 'year_before_1900'
  | GroupingExclusion
  | DuplicateResolution,
  number
>;

type DuplicateResolution =
  | 'duplicate_placeholder'
  | 'duplicate_not_in_grouping'
  | 'duplicate_identical'
  | 'duplicate_superseded';

const BASE_OBSERVATION_FILTERS = new Set<string>([
  'not_approved',
  'test_indicator',
  'note_506',
  'empty_observation',
  'year_before_1900',
]);

const MEASURES = [
  'Value',
  'Count',
  'Denominator',
  'Denominator_2',
  'LowerCI95',
  'UpperCI95',
  'LowerCI99_8',
  'UpperCI99_8',
  'ValueNoteId',
] as const;

function sentinelCodes(c: CdsRow): number {
  return (c.SexID === -1 ? 1 : 0) + (c.AgeID === -1 ? 1 : 0) + (c.YearRange === -1 ? 1 : 0);
}

export function resolveDuplicateGroup(
  rows: readonly CdsRow[],
  supersededSentinelIndicators: ReadonlySet<number>,
  groupings?: ObservationGroupings,
  noteTypeCategory: ReadonlyMap<number, string> = new Map(),
): { keep: CdsRow; reasonFor: (dropped: CdsRow) => DuplicateResolution } | undefined {
  const populated = rows.filter((row) =>
    MEASURES.some(
      (measure) => measure !== 'ValueNoteId' && row[measure] !== null && row[measure] !== -1,
    ),
  );
  const [onlyPopulated] = populated;
  const noteId = rows[0]?.ValueNoteId;
  const category = noteId === undefined ? undefined : noteTypeCategory.get(noteId);
  // A geographic note can accompany an empty duplicate too. It must not erase the
  // populated aggregate; disclosure and data-availability notes are different.
  if (
    populated.length === 1 &&
    onlyPopulated !== undefined &&
    category === 'geographic' &&
    rows.every((row) => row.ValueNoteId === noteId)
  ) {
    return { keep: onlyPopulated, reasonFor: () => 'duplicate_placeholder' };
  }
  const grouped = rows.filter((row) => groupings?.hasSeries(row));
  const candidates = grouped.length > 0 ? grouped : rows;
  const [canonical] = [...candidates].sort(
    (a, b) => sentinelCodes(a) - sentinelCodes(b) || a.uid - b.uid,
  );
  if (!canonical) return undefined;
  const identical = rows.every((row) =>
    MEASURES.every((measure) => row[measure] === canonical[measure]),
  );
  const resolved = (keep: CdsRow, reason: DuplicateResolution) => ({
    keep,
    reasonFor: (dropped: CdsRow): DuplicateResolution =>
      !identical && grouped.length > 0 && !groupings?.hasSeries(dropped)
        ? 'duplicate_not_in_grouping'
        : reason,
  });
  if (identical) return resolved(canonical, 'duplicate_identical');
  if (candidates.length === 1) return resolved(canonical, 'duplicate_not_in_grouping');
  if (candidates.every((c) => MEASURES.every((measure) => c[measure] === canonical[measure])))
    return resolved(canonical, 'duplicate_identical');
  const coded = candidates.filter((c) => sentinelCodes(c) === 0);
  if (supersededSentinelIndicators.has(canonical.IndicatorID) && coded.length === 1 && coded[0])
    return resolved(coded[0], 'duplicate_superseded');
  return undefined;
}

function exclusionReason(
  c: CdsRow,
  excluded: ReadonlySet<number>,
  selection: ObservationExportOptions['indicatorSelection'],
  selected: ReadonlySet<number>,
  groupings: ObservationGroupings,
): keyof ObservationExclusions | undefined {
  if (c.IndicatorID === 94204) return 'test_indicator';
  if (selection.kind === 'approved' && !selected.has(c.IndicatorID)) return 'not_approved';
  if (c.ValueNoteId === 506) return 'note_506';
  if (c.Value === -1 && c.Count === -1 && c.Denominator === -1 && c.ValueNoteId === 0)
    return 'empty_observation';
  if (c.Year < 1900) return 'year_before_1900';
  if (excluded.has(c.IndicatorID)) return 'excluded_indicator';
  return groupings.exclusionReason(c);
}

const observationQuery = `
  SELECT c.uid, c.IndicatorID, c.AreaCode,
    c.Year, c.Month, c.Quarter, c.YearRange, im.YearTypeID,
    c.SexID, c.AgeID, c.CategoryTypeID, c.CategoryID,
    c.Value, c.Count, c.Denominator, c.Denominator_2,
    c.LowerCI95, c.UpperCI95, c.LowerCI99_8, c.UpperCI99_8, c.ValueNoteId
  FROM dbo.CoreDataSet c
  LEFT JOIN dbo.IndicatorMetadata im ON c.IndicatorID = im.IndicatorID
`;

async function assertDistinctObservations(
  context: ObservationExportOptions,
  groupings: ObservationGroupings,
): Promise<{
  exclusions: ObservationExclusions;
  dropped: ReadonlySet<number>;
  sourceObservations: number;
  scannedObservations: number;
}> {
  const exclusions: ObservationExclusions = {
    not_approved: 0,
    test_indicator: 0,
    excluded_indicator: 0,
    note_506: 0,
    empty_observation: 0,
    year_before_1900: 0,
    year_range_not_in_grouping: 0,
    periodicity_not_in_grouping: 0,
    duplicate_placeholder: 0,
    duplicate_not_in_grouping: 0,
    duplicate_identical: 0,
    duplicate_superseded: 0,
  };
  const duplicates = new Map<string, number[]>();
  const excluded = new Set(context.excludedIndicators);
  const selected = new Set(
    context.indicatorSelection.kind === 'approved' ? context.indicatorSelection.indicators : [],
  );
  const seen = new Map<string, number>();
  let indicator: number | undefined;
  let sourceObservations = 0;
  let scannedObservations = 0;
  await streamPholio(context.pool, `${observationQuery} ORDER BY c.IndicatorID, c.uid`, (raw) => {
    const c = raw as unknown as CdsRow;
    const reason = exclusionReason(c, excluded, context.indicatorSelection, selected, groupings);
    const observationsInRow = COMPOUND_AGE_IDS.has(c.AgeID) && c.SexID === 4 ? 2 : 1;
    scannedObservations += observationsInRow;
    if (!reason || !BASE_OBSERVATION_FILTERS.has(reason)) {
      sourceObservations += observationsInRow;
    }
    if (reason) {
      exclusions[reason] += observationsInRow;
      return;
    }
    const diagnostic = `CoreDataSet uid ${c.uid}, indicator ${c.IndicatorID}`;
    if (!context.indicatorIds.has(c.IndicatorID))
      throw new Error(`${diagnostic}: missing indicator metadata`);
    const areaId = context.areaIdByPholioCode.get(c.AreaCode);
    if (areaId === undefined) throw new Error(`${diagnostic}: unknown area ${c.AreaCode}`);
    if (c.ValueNoteId !== 0 && !context.noteTypeCategory.has(c.ValueNoteId))
      throw new Error(`${diagnostic}: unknown note type ${c.ValueNoteId}`);
    computeCiPair(c.Value, c.LowerCI95, c.UpperCI95, `${diagnostic}, 95%`);
    computeCiPair(c.Value, c.LowerCI99_8, c.UpperCI99_8, `${diagnostic}, 99.8%`);
    // Any other sex would silently lose the age, as only SexID 4 is split into the sexed bands.
    if (COMPOUND_AGE_IDS.has(c.AgeID) && c.SexID !== 4)
      throw new Error(`${diagnostic}: compound age ${c.AgeID} with SexID ${c.SexID}, expected 4`);
    if (indicator !== c.IndicatorID) {
      seen.clear();
      indicator = c.IndicatorID;
    }
    const { fromDate, toDate } = computeDates(
      c.Year,
      c.Month,
      c.Quarter,
      c.YearRange,
      c.YearTypeID ?? 1,
    );
    for (const [split, dimensions] of observationDimensions(c).entries()) {
      for (const dimension of dimensions) {
        if (!context.dimensionValueIds.has(dimension.valueId))
          throw new Error(`${diagnostic}: unknown dimension value ${dimension.valueId}`);
      }
      const key = dedupKey(
        c.IndicatorID,
        areaId,
        fromDate,
        toDate,
        c.IndicatorID,
        dimensions.map((d) => d.valueId),
      );
      const previous = seen.get(key);
      const id = observationId(c.uid, split as 0 | 1);
      if (previous === undefined) seen.set(key, id);
      else duplicates.set(key, [...(duplicates.get(key) ?? [previous]), id]);
    }
  });
  const dropped = new Set<number>();
  if (duplicates.size === 0)
    return { exclusions, dropped, sourceObservations, scannedObservations };
  const rowsByUid = await sourceRowsByUid(context, [
    ...new Set([...duplicates.values()].flat().map(sourceUidForObservationId)),
  ]);
  const superseded = new Set(context.supersededSentinelIndicators);
  const unresolved = new Map<number, string[]>();
  for (const [key, ids] of duplicates) {
    const candidates = ids.map((id) => {
      const uid = sourceUidForObservationId(id);
      const row = rowsByUid.get(uid);
      if (!row) throw new Error(`CoreDataSet uid ${uid}: source changed after pre-flight`);
      return { id, row };
    });
    const rows = candidates.map(({ row }) => row);
    const resolution = resolveDuplicateGroup(rows, superseded, groupings, context.noteTypeCategory);
    if (!resolution) {
      const indicatorId = rows[0]?.IndicatorID ?? 0;
      const keys = unresolved.get(indicatorId) ?? [];
      keys.push(`${key} (CoreDataSet uids ${rows.map((row) => row.uid).join(', ')})`);
      unresolved.set(indicatorId, keys);
      continue;
    }
    for (const { id, row } of candidates) {
      if (row.uid === resolution.keep.uid) continue;
      dropped.add(id);
      exclusions[resolution.reasonFor(row)] += 1;
    }
  }
  if (unresolved.size > 0) {
    const total = [...unresolved.values()].reduce((sum, keys) => sum + keys.length, 0);
    const summary = [...unresolved]
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([indicatorId, keys]) => {
        const shown = keys.slice(0, 3).join('\n    ');
        const more = keys.length > 3 ? `\n    and ${keys.length - 3} more` : '';
        return `  indicator ${indicatorId}: ${keys.length} key(s)\n    ${shown}${more}`;
      });
    throw new Error(
      `${total} repeated observation key(s) across ${unresolved.size} indicator(s) could not be resolved; review the source rows before exporting:\n${summary.join('\n')}`,
    );
  }
  return { exclusions, dropped, sourceObservations, scannedObservations };
}

async function sourceRowsByUid(
  context: ObservationExportOptions,
  uids: readonly number[],
): Promise<Map<number, CdsRow>> {
  const rows = new Map<number, CdsRow>();
  for (let index = 0; index < uids.length; index += 500) {
    const chunk = uids.slice(index, index + 500);
    const query = `${observationQuery} WHERE c.uid IN (${chunk.join(', ')})`;
    for (const row of (await queryPholio(context.pool, query)) as unknown as CdsRow[])
      rows.set(row.uid, row);
  }
  return rows;
}

export async function exportObservations(context: ObservationExportOptions) {
  const groupings = await loadObservationGroupings(context.pool);
  const { exclusions, dropped, sourceObservations, scannedObservations } =
    await assertDistinctObservations(context, groupings);
  const obsWriter = new TableWriter(context.outDir, 'observation');
  const dimWriter = new TableWriter(context.outDir, 'observation_dimension');
  const noteWriter = new TableWriter(context.outDir, 'observation_note');
  const excluded = new Set(context.excludedIndicators);
  const selected = new Set(
    context.indicatorSelection.kind === 'approved' ? context.indicatorSelection.indicators : [],
  );
  await streamPholio(context.pool, `${observationQuery} ORDER BY c.uid`, async (raw) => {
    const c = raw as unknown as CdsRow;
    if (exclusionReason(c, excluded, context.indicatorSelection, selected, groupings)) return;
    const areaId = context.areaIdByPholioCode.get(c.AreaCode);
    const enteredAt = context.indicatorEnteredAt.get(c.IndicatorID);
    if (areaId === undefined || enteredAt === undefined)
      throw new Error(`CoreDataSet uid ${c.uid}: source changed after pre-flight`);
    const { fromDate, toDate } = computeDates(
      c.Year,
      c.Month,
      c.Quarter,
      c.YearRange,
      c.YearTypeID ?? 1,
    );
    const value = nullIfSentinel(c.Value);
    const suppressed = suppressSourceMeasures(c.Value, c.ValueNoteId);
    const ci95 = computeCiPair(c.Value ?? -1, c.LowerCI95, c.UpperCI95);
    const ci998 = computeCiPair(c.Value ?? -1, c.LowerCI99_8, c.UpperCI99_8);
    const halves = observationDimensions(c);
    for (const [split, dimensions] of halves.entries()) {
      const obsId = observationId(c.uid, split as 0 | 1);
      if (dropped.has(obsId)) continue;
      await obsWriter.write({
        id: obsId,
        indicator_id: c.IndicatorID,
        area_id: areaId,
        from_date: fromDate,
        to_date: toDate,
        value,
        ...countAndNumerator(
          suppressed ? null : nullIfSentinel(c.Count),
          context.countIsNumerator.has(c.IndicatorID),
        ),
        denominator: suppressed ? null : nullIfSentinel(c.Denominator),
        denominator_2: suppressed
          ? null
          : computeDenominator2(c.Denominator_2, nullIfSentinel(c.Denominator)),
        lower_ci_95: ci95.lower,
        upper_ci_95: ci95.upper,
        lower_ci_998: ci998.lower,
        upper_ci_998: ci998.upper,
        distribution_rank: null,
        published_at: enteredAt,
        upload_batch_id: c.IndicatorID,
        dimension_key: dimensions.map((d) => d.valueId).join(','),
        created_at: enteredAt,
        created_by: 'pholio-migration',
        deleted_at: null,
      });
      for (const dimension of dimensions) {
        await dimWriter.write({
          id: observationDimensionId(obsId, dimension.slot),
          observation_id: obsId,
          dimension_value_id: dimension.valueId,
          dimension_type_id: dimension.typeId,
        });
      }
      if (c.ValueNoteId !== 0)
        await noteWriter.write({
          id: observationNoteId(obsId),
          observation_id: obsId,
          note_type_id: c.ValueNoteId,
        });
    }
  });
  const tables = {
    observation: await obsWriter.close(),
    observation_dimension: await dimWriter.close(),
    observation_note: await noteWriter.close(),
  };
  const excludedObservations = Object.entries(exclusions)
    .filter(([reason]) => !BASE_OBSERVATION_FILTERS.has(reason))
    .reduce((sum, [, count]) => sum + count, 0);
  const allExclusions = Object.values(exclusions).reduce((sum, count) => sum + count, 0);
  if (
    tables.observation.rows + excludedObservations !== sourceObservations ||
    tables.observation.rows + allExclusions !== scannedObservations
  )
    throw new Error(
      `Observation accounting failed: wrote ${tables.observation.rows}, expected ${sourceObservations - excludedObservations} from ${sourceObservations} eligible source observations and ${excludedObservations} reviewed exclusions`,
    );
  return {
    sourceObservations,
    scannedObservations,
    excludedObservations,
    observationExclusions: exclusions,
    tables,
  };
}
