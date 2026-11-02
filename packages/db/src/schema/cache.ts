import {
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

// Derived read models rebuilt from canonical tables; deliberately no foreign keys so
// they can be truncated and rebuilt independently.

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
