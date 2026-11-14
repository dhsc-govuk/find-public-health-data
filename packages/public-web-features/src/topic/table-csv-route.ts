import { formatDate } from '@fphd/ui';
import type { LoaderFunctionArgs } from 'react-router';
import { recentTrend } from '../indicator/data.ts';
import { tableCsv } from '../indicator/download.ts';
import {
  comparisonSummary,
  JUDGEMENT_LABELS,
  type TopicColumn,
  topicColumns,
  topicEnglandMeasures,
} from './data.ts';
import { loadTopic } from './loader.ts';
import {
  sortTopicAreaTable,
  type TopicDataTableModel,
  topicAreaTableModel,
  topicDataTableModel,
} from './table-models.ts';

function areaSummariesCsv({ areas, rows }: ReturnType<typeof sortTopicAreaTable>) {
  return tableCsv([
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
    ...rows.map((row) => [
      row.name + (row.suffix ? ` ${row.suffix}` : ''),
      row.unit,
      row.period || 'No data',
      row.england.value,
      row.england.period,
      ...row.cells.flatMap((cell) => [
        cell.value,
        cell.period,
        cell.value === null ? 'No data' : JUDGEMENT_LABELS[cell.judgement],
        cell.notes.join('; '),
      ]),
    ]),
  ]);
}

export async function loader(args: LoaderFunctionArgs) {
  const url = new URL(args.request.url);
  const areasTab = url.searchParams.get('tab-topic') === 'areas';
  if (!areasTab) url.searchParams.set('tab-topic', 'data');
  const { topic, content } = await loadTopic({ ...args, request: new Request(url) });
  if (!content) throw new Error('Topic table download expects table data');
  const { data } = content;
  const csv = areasTab
    ? areaSummariesCsv(
        sortTopicAreaTable(
          topicAreaTableModel(data.selected, data.benchmarkGeography, topic.slug),
          url.searchParams,
        ),
      )
    : dataCsv(topicDataTableModel(data.selected, topic.slug), url.searchParams);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${topic.slug}-${areasTab ? 'area-summaries' : 'data'}.csv"`,
    },
  });
}

// Built from the same model as the on-screen table, so the download has the same columns.
function dataCsv(table: TopicDataTableModel, params: URLSearchParams) {
  const columns = topicColumns(params);
  const measures = columns.filter((column) =>
    ['trend', 'count', 'numerator', 'value'].includes(column),
  );
  const englandMeasures = topicEnglandMeasures(columns, table.compared);
  const measureLabel = (measure: TopicColumn) =>
    measure === 'trend'
      ? 'trend (last 5 periods)'
      : measure === 'count' || measure === 'numerator'
        ? measure
        : 'calculated value';
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
