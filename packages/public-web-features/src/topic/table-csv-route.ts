import { formatDate } from '@fphd/ui';
import type { LoaderFunctionArgs } from 'react-router';
import { comparisonTable } from '../indicator/comparison.ts';
import { recentTrend } from '../indicator/data.ts';
import { tableCsv } from '../indicator/download.ts';
import {
  comparisonSummary,
  englandObservation,
  JUDGEMENT_LABELS,
  observationPeriod,
  type TopicColumn,
  topicColumns,
  topicEnglandMeasures,
  topicJudgement,
} from './data.ts';
import { loadTopic } from './loader.ts';
import { type TopicDataTableModel, topicDataTableModel } from './table-models.ts';

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  if (url.searchParams.get('tab-topic') !== 'areas') url.searchParams.set('tab-topic', 'data');
  const { topic, content } = await loadTopic({ ...args, request: new Request(url) });
  if (!content) throw new Error('Topic table download expects table data');
  const { data } = content;
  const areasTab = new URL(args.request.url).searchParams.get('tab-topic') === 'areas';
  const model = comparisonTable(
    data.selected,
    data.benchmarkGeography,
    areasTab ? 'england' : 'none',
  );
  const byId = new Map(data.selected.map((entry) => [entry.detail.shortId, entry]));
  const areas = model.areas.filter(({ areaCode }) => areaCode !== 'E92000001');
  const columns = topicColumns(url.searchParams);
  const measures = columns.filter((column) =>
    ['trend', 'count', 'numerator', 'value'].includes(column),
  );
  const measureLabel = (measure: (typeof measures)[number]) =>
    measure === 'trend'
      ? 'trend (last 5 periods)'
      : measure === 'count' || measure === 'numerator'
        ? measure
        : 'calculated value';
  const csv = areasTab
    ? tableCsv([
        [
          'Indicator',
          'Unit',
          'Latest period',
          'England',
          'England period',
          ...areas.flatMap(({ areaName }) => [
            areaName,
            `${areaName} period`,
            `${areaName} comparison`,
            `${areaName} notes`,
          ]),
        ],
        ...model.rows.flatMap((row) => {
          const entry = byId.get(row.shortId);
          if (!entry) return [];
          const england = englandObservation(entry, row);
          return [
            [
              row.name + (row.suffix ? ` ${row.suffix}` : ''),
              row.unit,
              row.period,
              england?.value ?? null,
              observationPeriod(entry, england),
              ...row.cells
                .filter(({ areaCode }) => areaCode !== 'E92000001')
                .flatMap((cell) => {
                  const benchmark = model.benchmarkCellFor(row, cell);
                  return [
                    cell.value,
                    observationPeriod(entry, cell.series.at(-1)),
                    cell.value === null
                      ? 'No data'
                      : JUDGEMENT_LABELS[
                          topicJudgement(
                            benchmark?.areaObservation,
                            benchmark?.value ?? null,
                            entry.detail,
                          )
                        ],
                    cell.notes.join('; '),
                  ];
                }),
            ],
          ];
        }),
      ])
    : dataCsv(topicDataTableModel(data.selected, topic.slug), columns, measures, measureLabel);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${topic.slug}-${areasTab ? 'area-summaries' : 'data'}.csv"`,
    },
  });
}

// Built from the same model as the on-screen table, so the download has the same columns.
function dataCsv(
  table: TopicDataTableModel,
  columns: TopicColumn[],
  measures: TopicColumn[],
  measureLabel: (measure: TopicColumn) => string,
) {
  const englandMeasures = topicEnglandMeasures(columns, table.compared);
  const measureValue = (
    measure: TopicColumn,
    cell: Partial<TopicDataTableModel['rows'][number]['cells'][number]> | null | undefined,
  ) =>
    measure === 'trend'
      ? (cell?.trend ?? recentTrend([], null)).label
      : measure === 'count' || measure === 'numerator'
        ? (cell?.[measure] ?? null)
        : (cell?.value ?? null);
  return tableCsv([
    [
      'Indicator',
      'Subtopic',
      'Unit',
      ...(columns.includes('period') ? ['Most recent period'] : []),
      ...(columns.includes('updated') ? ['Last updated'] : []),
      ...table.areas.flatMap(({ name }) => [
        ...measures.map((measure) => `${name} ${measureLabel(measure)}`),
        ...(table.compared ? [`${name} period`, `${name} comparison summary`] : []),
      ]),
      ...englandMeasures.map((measure) => `England ${measureLabel(measure)}`),
    ],
    ...table.rows.map((row) => [
      row.name + (row.suffix ? ` ${row.suffix}` : ''),
      row.subtopics.join('; '),
      row.unit,
      ...(columns.includes('period') ? [row.period || 'No data'] : []),
      ...(columns.includes('updated')
        ? [row.updatedAt ? formatDate(row.updatedAt, 'short') : 'Not known']
        : []),
      ...table.areas.flatMap(({ code }) => {
        const cell = row.cells.find(({ areaCode }) => areaCode === code);
        return [
          ...measures.map((measure) => measureValue(measure, cell)),
          ...(table.compared
            ? cell?.value == null
              ? ['No data', 'No data']
              : [
                  cell.period ?? row.period,
                  comparisonSummary(cell.judgement, cell.benchmark, row.unit),
                ]
            : []),
        ];
      }),
      ...englandMeasures.map((measure) => measureValue(measure, row.england)),
    ]),
  ]);
}
