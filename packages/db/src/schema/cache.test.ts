import { getTableConfig, pgTable, text } from 'drizzle-orm/pg-core';
import { expect, it } from 'vitest';
import { observationSeries } from './cache.ts';
import { publishedObservationSeries } from './published.ts';

it('stores period choices as ordinary PostgreSQL text without enum constraints', () => {
  const old = pgTable('old_series', {
    periodType: text({ enum: ['all', '1-year', '3-year'] }).notNull(),
  });
  expect(old.periodType.getSQLType()).toBe('text');
  expect(observationSeries.periodType.getSQLType()).toBe(old.periodType.getSQLType());
  expect(publishedObservationSeries.periodType.getSQLType()).toBe('text');
  expect(getTableConfig(observationSeries).checks).toEqual([]);
  const choices: (typeof observationSeries.$inferSelect)['periodType'][] = [
    'all',
    '1-year',
    '3-year',
    '5-year',
    '7-year',
  ];
  expect(choices).toHaveLength(5);
});
