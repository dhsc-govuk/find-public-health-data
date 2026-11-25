/**
 * Fingertips' five-point recent trend, following the eligibility and comparator selection in
 * fingertips-open at 678089724a516138232d273c4c7f511ed3c5a338. The live API now publishes
 * trends for additional value types, so it cannot establish this version's eligibility rules.
 */
export type TrendDirection = 'up' | 'down' | 'right' | null;

export interface TrendObservation {
  fromDate: string;
  toDate: string;
  value: number | null;
  count: number | null;
  denominator: number | null;
  lowerCi95: number | null;
  upperCi95: number | null;
}

export interface TrendPoint {
  value: number;
  count: number;
  denominator: number;
  lowerCi95: number;
  upperCi95: number;
}

/** What a series offers the trend calculation, gathered once so the read models can store it. */
export interface TrendSummary {
  /** Every period is a year, or a single day as a yearly count at a date is. */
  annual: boolean;
  /** The unbroken run of valid rows a year apart, ending at the latest period. */
  run: number;
  runHasCountEqualToDenominator: boolean;
  /** The latest five points of the run, oldest first. */
  points: TrendPoint[];
}

export interface TrendSettings {
  valueType: string | null;
  comparatorMethod?: string | null;
}

export const TREND_POINTS = 5;
export const SPC_FOR_PROPORTIONS = 'SPC for proportions';
const CHI_SQUARE_CONFIDENCE = 9.54953570608324;

function isValidRow(row: TrendObservation): boolean {
  return (
    row.value !== null &&
    row.count !== null &&
    row.denominator !== null &&
    row.denominator > 0 &&
    row.lowerCi95 !== null &&
    row.upperCi95 !== null
  );
}

/** The same date a year later, or the end of February after 29 February, as Postgres has it. */
function yearAfter(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  return `${year + 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

/** Summarises a series in period order, oldest first. */
export function summariseTrend(series: readonly TrendObservation[], annual: boolean): TrendSummary {
  const run: TrendObservation[] = [];
  for (let index = series.length - 1; index >= 0; index--) {
    const row = series[index] as TrendObservation;
    const later = run.at(-1);
    if (!isValidRow(row) || (later && yearAfter(row.fromDate) !== later.fromDate)) break;
    run.push(row);
  }
  return {
    annual,
    run: run.length,
    runHasCountEqualToDenominator: run.some((row) => row.count === row.denominator),
    points: run
      .slice(0, TREND_POINTS)
      .reverse()
      .map((row) => ({
        value: row.value as number,
        count: row.count as number,
        denominator: row.denominator as number,
        lowerCi95: row.lowerCi95 as number,
        upperCi95: row.upperCi95 as number,
      })),
  };
}

/** Null when Fingertips would say the trend cannot be calculated. */
export function trendDirection(
  summary: TrendSummary | null | undefined,
  { valueType, comparatorMethod }: TrendSettings,
): TrendDirection {
  if (
    (valueType !== 'Proportion' && valueType !== 'Crude rate') ||
    !summary?.annual ||
    summary.run < TREND_POINTS ||
    summary.runHasCountEqualToDenominator
  )
    return null;
  const { significant, slope } =
    comparatorMethod === SPC_FOR_PROPORTIONS
      ? proportionsTest(summary.points)
      : intervalsTest(summary.points);
  if (!significant || !Number.isFinite(slope)) return 'right';
  return slope > 0 ? 'up' : 'down';
}

/**
 * Whether dropping any one point leaves the slope's sign unchanged, as Fingertips' outlier
 * check asks. `slopeWithout(0)` drops nothing.
 */
function noOutliers(slopeWithout: (omitted: number) => number): boolean {
  let signs = 0;
  for (let omitted = 0; omitted <= TREND_POINTS; omitted++)
    signs += slopeWithout(omitted) < 0 ? -1 : 1;
  return Math.abs(signs) === TREND_POINTS + 1;
}

function intervalsTest(points: TrendPoint[]): { significant: boolean; slope: number } {
  const terms = points.map(({ value, lowerCi95, upperCi95 }, index) => {
    const time = index + 1;
    const divisor = ((upperCi95 - lowerCi95) / 3.92) ** 2;
    return {
      time,
      a: 1 / divisor,
      b: (value * time) / divisor,
      c: time / divisor,
      d: value / divisor,
      e: time ** 2 / divisor,
    };
  });
  const fit = (omitted: number) => {
    let a = 0;
    let b = 0;
    let c = 0;
    let d = 0;
    let e = 0;
    for (const term of terms)
      if (term.time !== omitted) {
        a += term.a;
        b += term.b;
        c += term.c;
        d += term.d;
        e += term.e;
      }
    const spread = a * e - c ** 2;
    return { slope: (a * b - c * d) / spread, beta: Math.sqrt(a / spread) };
  };
  const { slope, beta } = fit(0);
  return {
    significant:
      noOutliers((omitted) => fit(omitted).slope) && (slope / beta) ** 2 > CHI_SQUARE_CONFIDENCE,
    slope,
  };
}

// Sums of the times 1–5, and five times the sums of their squares, without the omitted time.
const TIME_SUMS = [15, 14, 13, 12, 11, 10];
const SQUARED_TIME_SUMS = [275, 216, 204, 184, 156, 120];

function proportionsTest(points: TrendPoint[]): { significant: boolean; slope: number } {
  let denominators = 0;
  let countsByTime = 0;
  let counts = 0;
  let denominatorsByTime = 0;
  let denominatorsBySquaredTime = 0;
  const logits = points.map(({ count, denominator }, index) => {
    const time = index + 1;
    denominators += denominator;
    countsByTime += count * time;
    counts += count;
    denominatorsByTime += denominator * time;
    denominatorsBySquaredTime += denominator * time ** 2;
    const logit = Math.log(count / (denominator - count));
    return { time, logit, timed: logit * time };
  });
  const chiSquare =
    (denominators * (denominators * countsByTime - counts * denominatorsByTime) ** 2) /
    (counts *
      (denominators - counts) *
      (denominators * denominatorsBySquaredTime - denominatorsByTime ** 2));
  const slopeWithout = (omitted: number) => {
    let sum = 0;
    let timed = 0;
    for (const logit of logits)
      if (logit.time !== omitted) {
        sum += logit.logit;
        timed += logit.timed;
      }
    timed *= omitted === 0 ? TREND_POINTS : TREND_POINTS - 1;
    const times = TIME_SUMS[omitted] as number;
    return (timed - sum * times) / ((SQUARED_TIME_SUMS[omitted] as number) - times ** 2);
  };
  return {
    significant: noOutliers(slopeWithout) && chiSquare > CHI_SQUARE_CONFIDENCE,
    // fingertips-open reads the direction here from a slope field only the other test sets; the
    // live Fingertips publishes the direction of the fitted logit slope.
    slope: slopeWithout(0),
  };
}
