import type mssql from 'mssql';
import { computeDates } from './period.ts';
import { queryPholio } from './source.ts';

interface Grouping {
  GroupingID: number;
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

export interface GroupingBaselineExclusion {
  indicator_id: number;
  grouping: Grouping;
  year_type_id: number | null;
  reason: string;
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
    `SELECT GroupingID, IndicatorID, SexID, AgeID, YearRange,
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
    rows,
    publishedFrom(
      indicatorId: number,
      yearTypeId: number | null,
      onSkipped?: (exclusion: GroupingBaselineExclusion) => void,
    ): string | null {
      let earliest: string | null = null;
      const tried = new Set<string>();
      for (const grouping of byIndicator.get(indicatorId) ?? []) {
        const shape = [
          grouping.BaselineYear,
          grouping.BaselineQuarter,
          grouping.BaselineMonth,
          grouping.YearRange,
        ].join('/');
        if (tried.has(shape)) continue;
        tried.add(shape);
        try {
          const { fromDate } = computeDates(
            grouping.BaselineYear,
            grouping.BaselineMonth,
            grouping.BaselineQuarter,
            grouping.YearRange,
            yearTypeId,
          );
          if (earliest === null || fromDate < earliest) earliest = fromDate;
        } catch (error) {
          onSkipped?.({
            indicator_id: indicatorId,
            grouping,
            year_type_id: yearTypeId,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
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
    hasCumulativeSeries(indicatorId: number): boolean {
      return (byIndicator.get(indicatorId) ?? []).some(
        (grouping) => grouping.BaselineYear != null && grouping.BaselineQuarter > 0,
      );
    },
    hasCumulativeBaseline(row: ObservationSeries & { Year: number }): boolean {
      return (byIndicator.get(row.IndicatorID) ?? []).some(
        (grouping) =>
          grouping.BaselineYear === row.Year &&
          grouping.YearRange === row.YearRange &&
          samePeriodicity(grouping, row) &&
          grouping.SexID === row.SexID &&
          grouping.AgeID === row.AgeID,
      );
    },
    retainsCumulativeHistory(row: ObservationSeries): boolean {
      return (byIndicator.get(row.IndicatorID) ?? []).some(
        (grouping) =>
          grouping.BaselineYear != null &&
          grouping.BaselineQuarter > 0 &&
          grouping.SexID === row.SexID &&
          grouping.AgeID === row.AgeID &&
          ((grouping.YearRange === row.YearRange && samePeriodicity(grouping, row)) ||
            (row.Quarter === -1 &&
              row.Month === -1 &&
              (row.YearRange === 1 || row.YearRange === grouping.YearRange))),
      );
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
