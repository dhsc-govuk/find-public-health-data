import type { SeriesPeriodType } from '@fphd/utils/observation-series';
import type { TrendSummary } from '@fphd/utils/recent-trend';
import {
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

// Derived read models rebuilt from canonical tables; deliberately no foreign keys so
// they can be truncated and rebuilt independently.

export interface ObservationSeriesVariant {
  headline?: boolean;
  sexes?: string[];
  sex: string;
  periodType: SeriesPeriodType;
}

export const observationSeriesBatch = pgTable('observation_series_batch', {
  version: integer().notNull().default(0),
  // England's headline series; null when England has no data.
  trend: jsonb().$type<TrendSummary>(),
  uploadBatchId: uuid().primaryKey(),
  indicatorId: uuid().notNull(),
});

export const observationSeries = pgTable(
  'observation_series',
  {
    uploadBatchId: uuid().notNull(),
    indicatorId: uuid().notNull(),
    areaId: uuid().notNull(),
    dimensionKey: text().notNull(),
    sex: text().notNull(),
    periodType: text().$type<SeriesPeriodType>().notNull(),
    variants: jsonb().$type<ObservationSeriesVariant[]>().notNull(),
    latestObservationId: uuid().notNull(),
    rankingObservationId: uuid(),
    recentObservationIds: uuid().array().notNull(),
    sparklineObservationIds: uuid().array(),
    // Null only in rows written before this column existed, which the batch version rules out.
    trend: jsonb().$type<TrendSummary>(),
  },
  (t) => [
    primaryKey({ columns: [t.uploadBatchId, t.areaId, t.sex, t.periodType] }),
    index('idx_observation_series_indicator_area').on(t.indicatorId, t.areaId),
  ],
);

export const availableData = pgTable(
  'available_data',
  {
    indicatorId: uuid().notNull(),
    areaTypeId: uuid().notNull(),
    areaTypeName: text().notNull(),
    areaCount: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.indicatorId, t.areaTypeId] }),
    index('idx_available_data_area_indicator').on(t.areaTypeId, t.indicatorId),
  ],
);

export const observationRange = pgTable(
  'observation_range',
  {
    indicatorId: uuid().notNull(),
    displayGroup: text().notNull(),
    fromDate: date().notNull(),
    toDate: date().notNull(),
    segment: text().notNull(),
    min: doublePrecision().notNull(),
    max: doublePrecision().notNull(),
    p25: doublePrecision(),
    p75: doublePrecision(),
    quintileCutoffs: doublePrecision().array(),
  },
  (t) => [
    primaryKey({
      name: 'observation_range_pk',
      columns: [t.indicatorId, t.displayGroup, t.fromDate, t.toDate, t.segment],
    }),
  ],
);
