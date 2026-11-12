import { comparisonTable } from '../indicator/comparison.ts';
import { comparisonRows, recentTrend } from '../indicator/data.ts';
import type { BenchmarkGeography, SelectedIndicator } from '../indicator/loader.ts';
import {
  englandObservation,
  observationPeriod,
  topicAreaJudgement,
  topicJudgement,
  topicSubtopics,
} from './data.ts';

export function topicDataTableModel(selected: SelectedIndicator[], topicSlug: string) {
  const byId = new Map(selected.map((entry) => [entry.detail.shortId, entry]));
  const rows = comparisonRows(selected);
  const areas = [
    ...new Map(
      rows.flatMap((row) => row.cells.map((cell) => [cell.areaCode, cell.areaName] as const)),
    ).entries(),
  ]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) =>
      a.code === 'E92000001' ? -1 : b.code === 'E92000001' ? 1 : a.name.localeCompare(b.name),
    );
  // comparisonRows drops England once areas are picked; the table keeps it as the
  // benchmark each picked area is judged against.
  const compared = areas.some(({ code }) => code !== 'E92000001');
  return {
    kind: 'data' as const,
    compared,
    areas,
    rows: rows.flatMap((row) => {
      const entry = byId.get(row.shortId);
      if (!entry) return [];
      const england = compared ? englandObservation(entry, row) : undefined;
      return [
        {
          key: row.key,
          name: row.name,
          slug: entry.detail.slug,
          suffix: row.suffix,
          period: row.period,
          unit: entry.detail.unit,
          updatedAt: entry.detail.dataUpdatedAt,
          subtopics: topicSubtopics(entry, topicSlug),
          england: compared
            ? {
                value: england?.value ?? null,
                count: england?.count ?? null,
                numerator: england?.numerator ?? null,
              }
            : null,
          cells: row.cells.map((cell) => {
            const latest = cell.series.at(-1);
            // An area whose data lags the row is judged against England for its own period.
            const period = latest ? observationPeriod(entry, latest) : row.period;
            return {
              areaCode: cell.areaCode,
              value: latest?.value ?? null,
              count: latest?.count ?? null,
              numerator: latest?.numerator ?? null,
              trend: recentTrend(cell.series, entry.detail.polarity, cell.trendDirection),
              judgement: compared ? topicAreaJudgement(entry, row, cell) : null,
              ...(period !== row.period ? { period } : {}),
            };
          }),
        },
      ];
    }),
  };
}

export function topicAreaTableModel(
  selected: SelectedIndicator[],
  geography: BenchmarkGeography,
  topicSlug: string,
) {
  const { areas, rows, benchmarkCellFor } = comparisonTable(selected, geography, 'england');
  const byId = new Map(selected.map((entry) => [entry.detail.shortId, entry]));
  return {
    kind: 'areas' as const,
    areas: areas.filter(({ areaCode }) => areaCode !== 'E92000001'),
    rows: rows.flatMap((row) => {
      const entry = byId.get(row.shortId);
      if (!entry) return [];
      const england = englandObservation(entry, row);
      return [
        {
          key: row.key,
          name: row.name,
          slug: entry.detail.slug,
          suffix: row.suffix,
          period: row.period,
          unit: row.unit,
          subtopics: topicSubtopics(entry, topicSlug),
          england: {
            value: england?.value ?? null,
            period: observationPeriod(entry, england),
            notes: england?.notes.map(({ text }) => text) ?? [],
          },
          cells: row.cells
            .filter(({ areaCode }) => areaCode !== 'E92000001')
            .map((cell) => {
              const benchmark = benchmarkCellFor(row, cell);
              return {
                areaCode: cell.areaCode,
                value: cell.value,
                notes: cell.notes,
                period: observationPeriod(entry, cell.series.at(-1)),
                judgement: topicJudgement(
                  benchmark?.areaObservation,
                  benchmark?.value ?? null,
                  entry.detail,
                ),
              };
            }),
        },
      ];
    }),
  };
}

export type TopicDataTableModel = ReturnType<typeof topicDataTableModel>;
export type TopicAreaTableModel = ReturnType<typeof topicAreaTableModel>;
