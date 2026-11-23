import type mssql from 'mssql';
import { computeDates } from './period.ts';
import { queryPholio } from './source.ts';

interface Grouping {
  IndicatorID: number;
  SexID: number;
  AgeID: number;
  YearRange: number;
  BaselineYear: number;
  BaselineQuarter: number;
  BaselineMonth: number;
}

interface ObservationSeries {
  IndicatorID: number;
  SexID: number;
  AgeID: number;
  YearRange: number;
  Quarter: number;
  Month: number;
}

export type GroupingExclusion = 'year_range_not_in_grouping' | 'periodicity_not_in_grouping';

function samePeriodicity(grouping: Grouping, row: ObservationSeries): boolean {
  if (grouping.BaselineQuarter > 0) return row.Quarter > 0 && row.Month === -1;
  if (grouping.BaselineMonth > 0) return row.Month > 0 && row.Quarter === -1;
  return row.Quarter === -1 && row.Month === -1;
}

export async function loadObservationGroupings(pool: mssql.ConnectionPool) {
  const rows = await queryPholio<Grouping>(
    pool,
    `SELECT DISTINCT IndicatorID, SexID, AgeID, YearRange,
       BaselineYear, BaselineQuarter, BaselineMonth
     FROM dbo.Grouping`,
  );
  return createObservationGroupings(rows);
}

export function createObservationGroupings(rows: readonly Grouping[]) {
  const byIndicator = new Map<number, Grouping[]>();
  for (const row of rows) {
    const groupings = byIndicator.get(row.IndicatorID) ?? [];
    groupings.push(row);
    byIndicator.set(row.IndicatorID, groupings);
  }
  return {
    publishedFrom(indicatorId: number, yearTypeId: number): string | null {
      let earliest: string | null = null;
      for (const grouping of byIndicator.get(indicatorId) ?? []) {
        const { fromDate } = computeDates(
          grouping.BaselineYear,
          grouping.BaselineMonth,
          grouping.BaselineQuarter,
          grouping.YearRange,
          yearTypeId,
        );
        if (earliest === null || fromDate < earliest) earliest = fromDate;
      }
      return earliest;
    },
    exclusionReason(row: ObservationSeries): GroupingExclusion | undefined {
      const groupings = byIndicator.get(row.IndicatorID);
      if (!groupings) return undefined;
      const sameRange = groupings.filter((grouping) => grouping.YearRange === row.YearRange);
      if (sameRange.length === 0) return 'year_range_not_in_grouping';
      if (!sameRange.some((grouping) => samePeriodicity(grouping, row)))
        return 'periodicity_not_in_grouping';
      return undefined;
    },
    hasSeries(row: ObservationSeries): boolean {
      return (byIndicator.get(row.IndicatorID) ?? []).some(
        (grouping) =>
          grouping.YearRange === row.YearRange &&
          samePeriodicity(grouping, row) &&
          grouping.SexID === row.SexID &&
          grouping.AgeID === row.AgeID,
      );
    },
  };
}

export type ObservationGroupings = ReturnType<typeof createObservationGroupings>;
