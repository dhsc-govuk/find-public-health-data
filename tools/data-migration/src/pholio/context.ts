import type mssql from 'mssql';
import type { fileRecord } from '../files.ts';

export type ExportedFile = Awaited<ReturnType<typeof fileRecord>>;
export type StageResult = Partial<Record<string, ExportedFile>>;

export type IndicatorSelection =
  | { kind: 'approved'; indicators: readonly number[] }
  | { kind: 'development-snapshot' };

export interface PholioSource {
  pool: mssql.ConnectionPool;
  outDir: string;
}

export interface PholioExportOptions extends PholioSource {
  excludedIndicators: readonly number[];
  indicatorSelection: IndicatorSelection;
}

export interface ObservationExportOptions extends PholioExportOptions {
  noteTypeCategory: ReadonlyMap<number, string>;
  areaIdByPholioCode: ReadonlyMap<string, number>;
  dimensionValueIds: ReadonlySet<number>;
  indicatorIds: ReadonlySet<number>;
  indicatorEnteredAt: ReadonlyMap<number, string>;
  /** Indicators whose value type makes Pholio's Count their numerator. */
  countIsNumerator: ReadonlySet<number>;
  /**
   * Indicators whose rows coded "not applicable" (SexID, AgeID or YearRange -1) are stale copies
   * of the coded rows they collide with, so the coded row wins even when the measures differ.
   */
  supersededSentinelIndicators: readonly number[];
}
