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
  const areas = [
    ...new Map(
      rows.flatMap((row) => row.cells.map((cell) => [cell.areaCode, cell.areaName] as const)),
    ).entries(),
  ]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) =>
      a.code === 'E92000001' ? -1 : b.code === 'E92000001' ? 1 : a.name.localeCompare(b.name),
    );
  return {
    kind: 'data' as const,
    areas,
    rows: rows.flatMap((row) => {
      const entry = byId.get(row.shortId);
      if (!entry) return [];
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
          cells: row.cells.map((cell) => ({
            areaCode: cell.areaCode,
            value: cell.series.at(-1)?.value ?? null,
            count: cell.series.at(-1)?.count ?? null,
            numerator: cell.series.at(-1)?.numerator ?? null,
            trend: recentTrend(cell.series, entry.detail.polarity, cell.trendDirection),
          })),
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
  if (!row || model.areas.length < 2) return { ...model, rows, columnSort: null };

  const reverse = selection[1] === 'reverse';
  const descending = reverse === (row.goodDirection === 'low');
  const values = new Map(row.cells.map(({ areaCode, value }) => [areaCode, value]));
  const areas = model.areas.toSorted((a, b) => {
    const left = values.get(a.areaCode);
    const right = values.get(b.areaCode);
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return descending ? right - left : left - right;
  });
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
    columnSort: {
      key: row.key,
      reverse,
      direction: descending ? 'descending' : 'ascending',
    } as const,
  };
}
