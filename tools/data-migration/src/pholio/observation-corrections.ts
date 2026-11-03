import type { CdsRow } from './observations.ts';
import verifiedIntervals from './vaccination-interval-corrections.ts';

export interface ObservationCorrection {
  source_uid: number;
  indicator_id: number;
  field: 'UpperCI99_8';
  original_value: number;
  corrected_value: number;
  evidence_url: string;
}

const correctionsByUid = new Map<number, (typeof verifiedIntervals)[number]>(
  verifiedIntervals.map((entry) => [entry.expected.uid, entry]),
);

// Each Wilson repair reproduces the source's valid 95% bounds and 99.8% lower bound.
export function correctObservationInterval(
  row: CdsRow,
  applied?: Map<number, ObservationCorrection>,
): CdsRow {
  const correction = correctionsByUid.get(row.uid);
  if (!correction || row.UpperCI99_8 !== 0) return row;
  for (const [field, expected] of Object.entries(correction.expected)) {
    const actual = row[field as keyof CdsRow];
    const matches =
      typeof actual === 'number' && typeof expected === 'number'
        ? Math.abs(actual - expected) <= 1e-10
        : actual === expected;
    if (!matches)
      throw new Error(
        `CoreDataSet uid ${row.uid}, indicator ${row.IndicatorID}: verified interval correction does not match source ${field}`,
      );
  }
  applied?.set(row.uid, {
    source_uid: row.uid,
    indicator_id: row.IndicatorID,
    field: 'UpperCI99_8',
    original_value: 0,
    corrected_value: correction.corrected_upper_ci_998,
    evidence_url: correction.evidence_url,
  });
  return { ...row, UpperCI99_8: correction.corrected_upper_ci_998 };
}
