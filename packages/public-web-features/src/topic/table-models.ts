import { comparisonTable } from '../indicator/comparison.ts';
import { comparisonRows, polarityGoodDirection, recentTrend } from '../indicator/data.ts';
import type { BenchmarkGeography, SelectedIndicator } from '../indicator/loader.ts';
import {
  englandObservation,
  observationPeriod,
  topicAreaRowSort,
  topicJudgement,
  topicSubtopics,
} from './data.ts';

export function topicDataTableModel(selected: SelectedIndicator[], topicSlug: string) {
  const byId = new Map(selected.map((entry) => [entry.detail.shortId, entry]));
  const rows = comparisonRows(selected);
  const cellAreas = [
    ...new Map(
      rows.flatMap((row) => row.cells.map((cell) => [cell.areaCode, cell.areaName] as const)),
    ).entries(),
  ].map(([code, name]) => ({ code, name }));
  // comparisonRows drops England once areas are picked, except for an indicator with no data
  // for any picked area. Once any area is picked, England is the benchmark each is judged
  // against, in its own columns, rather than an area of its own.
  const compared = cellAreas.some(({ code }) => code !== 'E92000001');
  const areas = cellAreas
    .filter(({ code }) => !compared || code !== 'E92000001')
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    kind: 'data' as const,
    compared,
    areas,
    rows: rows.flatMap((row) => {
      const entry = byId.get(row.shortId);
      if (!entry) return [];
      // comparisonRows dates a row by its first area with data; a lagging first area would hold
      // the row and its England benchmark back, so take the newest area's period instead.
      const newest = row.cells.reduce<(typeof row.cells)[number] | undefined>((best, cell) => {
        const latest = cell.series.at(-1);
        const bestLatest = best?.series.at(-1);
        return latest?.value != null && (!bestLatest || latest.toDate > bestLatest.toDate)
          ? cell
          : best;
      }, undefined);
      const reference = newest ? { ...row, series: newest.series } : row;
      const rowPeriod = newest ? observationPeriod(entry, newest.series.at(-1)) : row.period;
      const england = compared ? englandObservation(entry, reference) : undefined;
      return [
        {
          key: row.key,
          name: row.name,
          slug: entry.detail.slug,
          suffix: row.suffix,
          period: rowPeriod,
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
            const period = latest?.value != null ? observationPeriod(entry, latest) : rowPeriod;
            const benchmark = compared
              ? englandObservation(entry, { ...row, series: cell.series })
              : undefined;
            return {
              areaCode: cell.areaCode,
              value: latest?.value ?? null,
              count: latest?.count ?? null,
              numerator: latest?.numerator ?? null,
              trend: recentTrend(cell.series, entry.detail.polarity, cell.trendDirection),
              judgement:
                benchmark?.value != null
                  ? topicJudgement(latest, benchmark.value, entry.detail)
                  : null,
              ...(period !== rowPeriod ? { period } : {}),
              ...(latest?.value != null && benchmark?.value != null && benchmark !== england
                ? {
                    benchmark: {
                      value: benchmark.value,
                      period: observationPeriod(entry, benchmark),
                    },
                  }
                : {}),
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
  const { rows, benchmarkCellFor } = comparisonTable(selected, geography, 'england');
  const areas = [
    ...new Map(
      rows.flatMap((row) =>
        row.cells.map(({ areaCode, areaName }) => [areaCode, { areaCode, areaName }] as const),
      ),
    ).values(),
  ];
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
          updatedAt: entry.detail.dataUpdatedAt,
          goodDirection: polarityGoodDirection(entry.detail.polarity),
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

export function sortTopicAreaTable(model: TopicAreaTableModel, params: URLSearchParams) {
  const rowSort = topicAreaRowSort(params);
  const rows = model.rows.toSorted((a, b) => {
    const byName = a.name.localeCompare(b.name);
    switch (rowSort) {
      case 'name-asc':
        return byName;
      case 'name-desc':
        return -byName;
      case 'recently-updated':
        return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || byName;
      default: {
        const left = a.subtopics[0];
        const right = b.subtopics[0];
        if (left === undefined) return right === undefined ? byName : 1;
        if (right === undefined) return -1;
        const direction = rowSort === 'subtopic-asc' ? 1 : -1;
        return direction * left.localeCompare(right) || byName;
      }
    }
  });
  const selection = /^(first|reverse):(.+)$/.exec(params.get('sortAreas') ?? '');
  const row = selection && rows.find(({ key }) => key === selection[2]);
  let areas = model.areas;
  let columnSort: { key: string; reverse: boolean; direction: 'descending' | 'ascending' } | null =
    null;
  if (row && areas.length > 1) {
    const reverse = selection[1] === 'reverse';
    const descending = reverse === (row.goodDirection === 'low');
    const values = new Map(row.cells.map(({ areaCode, value }) => [areaCode, value]));
    areas = areas.toSorted((a, b) => {
      const left = values.get(a.areaCode);
      const right = values.get(b.areaCode);
      if (left == null) return right == null ? 0 : 1;
      if (right == null) return -1;
      return descending ? right - left : left - right;
    });
    columnSort = { key: row.key, reverse, direction: descending ? 'descending' : 'ascending' };
  }
  return {
    ...model,
    areas,
    rows: rows.map((entry) => {
      const cells = new Map(entry.cells.map((cell) => [cell.areaCode, cell]));
      return {
        ...entry,
        cells: areas.map(
          ({ areaCode }) =>
            cells.get(areaCode) ?? {
              areaCode,
              value: null,
              notes: [],
              period: 'No data',
              judgement: 'none' as const,
            },
        ),
      };
    }),
    columnSort,
  };
}
