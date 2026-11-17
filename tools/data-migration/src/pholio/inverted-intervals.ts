import type { CdsRow } from './observations.ts';
import publishedInvertedIntervals from './published-inverted-intervals.ts';

const intervalsByUid = new Map<number, (typeof publishedInvertedIntervals)[number]>(
  publishedInvertedIntervals.map((entry) => [entry.uid, entry]),
);

export function isPublishedInvertedInterval(row: CdsRow): boolean {
  const entry = intervalsByUid.get(row.uid);
  if (!entry) return false;
  for (const [field, expected] of Object.entries(entry)) {
    const actual = row[field as keyof CdsRow];
    const matches =
      typeof actual === 'number' && typeof expected === 'number'
        ? Math.abs(actual - expected) <= 1e-10
        : actual === expected;
    if (!matches)
      throw new Error(
        `CoreDataSet uid ${row.uid}, indicator ${row.IndicatorID}: published inverted interval does not match source ${field}`,
      );
  }
  return true;
}
