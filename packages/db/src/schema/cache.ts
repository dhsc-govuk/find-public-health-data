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
  sex: string;
  periodType: 'all' | '1-year' | '3-year';
}

export const observationSeriesBatch = pgTable('observation_series_batch', {
  trendValues: doublePrecision().array(),
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
    periodType: text({ enum: ['all', '1-year', '3-year'] }).notNull(),
    variants: jsonb().$type<ObservationSeriesVariant[]>().notNull(),
    latestObservationId: uuid().notNull(),
    rankingObservationId: uuid(),
    recentObservationIds: uuid().array().notNull(),
    recentValues: doublePrecision().array().notNull(),
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
  },
  (t) => [
    primaryKey({
      name: 'observation_range_pk',
      columns: [t.indicatorId, t.displayGroup, t.fromDate, t.toDate, t.segment],
    }),
  ],
);
