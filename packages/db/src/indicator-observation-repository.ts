import {
  rankingAreaSeries,
  type TableSeriesSelection,
  tableAreaSeries,
  tableSummary,
} from '@fphd/utils/observation-series';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import {
  publishedArea as area,
  publishedDimensionType as dimensionType,
  publishedDimensionValue as dimensionValue,
  publishedNoteType as noteType,
  publishedObservation as observation,
  publishedObservationNote as observationNote,
} from './schema/index.ts';

export interface ObservationDimensionValue {
  type: string;
  value: string;
  dimensionClass: string;
  sortOrder: number;
}

export interface IndicatorObservation {
  fromDate: string;
  toDate: string;
  value: number | null;
  lowerCi95: number | null;
  upperCi95: number | null;
  lowerCi998: number | null;
  upperCi998: number | null;
  count: number | null;
  numerator: number | null;
  denominator: number | null;
  dimensions: ObservationDimensionValue[];
  /** Note texts attached to the value, with their category ("quality", "disclosure"…). */
  notes: { text: string; category: string }[];
}

export interface IndicatorAreaData {
  areaCode: string;
  areaName: string;
  observations: IndicatorObservation[];
}

/**
 * All published observations for one indicator in one area, with their dimension labels.
 * An observation with no dimensions is the fully-aggregate value for its period.
 */
export async function getIndicatorObservationsForAreas(
  db: Database,
  indicatorId: string,
  areaCodes: string[],
): Promise<IndicatorAreaData[]> {
  return (
    (await getIndicatorObservationData(db, [indicatorId], areaCodes)).get(indicatorId)?.areaData ??
    []
  );
}

/** Load a table's indicators together so its query count does not grow with its rows. */
export async function getIndicatorObservationData(
  db: Database,
  indicatorIds: string[],
  areaCodes: string[],
  projection?: 'table' | 'summary' | 'ranking' | 'sparkline',
): Promise<Map<string, { areaData: IndicatorAreaData[]; tableSeries?: TableSeriesSelection[] }>> {
  if (indicatorIds.length === 0 || areaCodes.length === 0) return new Map();
  const fields = {
    obsId: observation.id,
    indicatorId: observation.indicatorId,
    areaId: observation.areaId,
    dimensionKey: observation.dimensionKey,
    fromDate: observation.fromDate,
    toDate: observation.toDate,
    value: observation.value,
    lowerCi95: observation.lowerCi95,
    upperCi95: observation.upperCi95,
    lowerCi998: observation.lowerCi998,
    upperCi998: observation.upperCi998,
    count: observation.count,
    numerator: observation.numerator,
    denominator: observation.denominator,
    areaCode: area.code,
    areaName: area.name,
  };
  const query = db
    .select(fields)
    .from(observation)
    .innerJoin(area, and(eq(observation.areaId, area.id), inArray(area.code, areaCodes)))
    .where(inArray(observation.indicatorId, indicatorIds));
  const rows = await query.orderBy(
    asc(observation.fromDate),
    asc(observation.toDate),
    asc(observation.dimensionKey),
  );

  const names = new Map(rows.map(({ areaCode, areaName }) => [areaCode, areaName]));
  const missing = areaCodes.filter((code) => !names.has(code));
  if (missing.length > 0) {
    const known = await db
      .select({ code: area.code, name: area.name })
      .from(area)
      .where(inArray(area.code, missing));
    for (const { code, name } of known) names.set(code, name);
  }
  const valueIds = [
    ...new Set(rows.flatMap(({ dimensionKey }) => dimensionKey.split(',').filter(Boolean))),
  ];
  const dimensionRows = valueIds.length
    ? await db
        .select({
          id: dimensionValue.id,
          type: dimensionType.name,
          value: dimensionValue.name,
          dimensionClass: dimensionType.dimensionClass,
          sortOrder: dimensionValue.sortOrder,
        })
        .from(dimensionValue)
        .innerJoin(dimensionType, eq(dimensionValue.dimensionTypeId, dimensionType.id))
        .where(inArray(dimensionValue.id, valueIds))
    : [];
  const dimensionsById = new Map(dimensionRows.map(({ id, ...dimension }) => [id, dimension]));

  type Point = IndicatorObservation & { obsId: string };
  const byIndicator = new Map<string, Map<string, Point[]>>();
  for (const {
    obsId,
    indicatorId,
    areaId: _areaId,
    dimensionKey,
    areaCode,
    areaName: _areaName,
    ...observationRow
  } of rows) {
    const byArea = byIndicator.get(indicatorId) ?? new Map<string, Point[]>();
    const observations = byArea.get(areaCode) ?? [];
    observations.push({
      obsId,
      ...observationRow,
      dimensions: dimensionKey
        .split(',')
        .flatMap((id) => {
          const dimension = dimensionsById.get(id);
          return dimension ? [dimension] : [];
        })
        .sort((a, b) => a.type.localeCompare(b.type)),
      notes: [],
    });
    byArea.set(areaCode, observations);
    byIndicator.set(indicatorId, byArea);
  }
  const entries = indicatorIds.map((id) => {
    const areaData = areaCodes.flatMap((areaCode) => {
      const areaName = names.get(areaCode);
      return areaName
        ? [{ areaCode, areaName, observations: byIndicator.get(id)?.get(areaCode) ?? [] }]
        : [];
    });
    return {
      id,
      ...(projection === 'table' || projection === 'summary' || projection === 'sparkline'
        ? tableSummary(
            tableAreaSeries(areaData),
            projection === 'summary'
              ? 'latest'
              : projection === 'sparkline'
                ? 'sparkline'
                : 'recent',
          )
        : { areaData: projection === 'ranking' ? rankingAreaSeries(areaData) : areaData }),
    };
  });
  const points = entries.flatMap(({ areaData }) => areaData.flatMap((area) => area.observations));
  const observationIds = `{${points.map(({ obsId }) => obsId).join(',')}}`;
  const noteRows = points.length
    ? await db
        .select({
          observationId: observationNote.observationId,
          text: noteType.text,
          category: noteType.category,
        })
        .from(observationNote)
        .innerJoin(noteType, eq(observationNote.noteTypeId, noteType.id))
        .where(sql`${observationNote.observationId} = any(${observationIds}::uuid[])`)
    : [];

  const notesByObservation = new Map<string, { text: string; category: string }[]>();
  for (const { observationId, ...note } of noteRows) {
    const existing = notesByObservation.get(observationId);
    if (existing) {
      existing.push(note);
    } else {
      notesByObservation.set(observationId, [note]);
    }
  }

  return new Map(
    entries.map(({ id, ...entry }) => [
      id,
      {
        ...entry,
        areaData: entry.areaData.map((area) => ({
          ...area,
          observations: area.observations.map(({ obsId, ...point }) => ({
            ...point,
            notes: notesByObservation.get(obsId) ?? [],
          })),
        })),
      },
    ]),
  );
}

export async function getIndicatorObservations(
  db: Database,
  indicatorId: string,
  areaCode: string,
): Promise<IndicatorAreaData | undefined> {
  return (await getIndicatorObservationsForAreas(db, indicatorId, [areaCode]))[0];
}
