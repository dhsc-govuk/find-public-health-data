import { formatDate } from '@fphd/ui';
import type { LoaderFunctionArgs } from 'react-router';
import { comparisonTable } from '../indicator/comparison.ts';
import { recentTrend } from '../indicator/data.ts';
import { tableCsv } from '../indicator/download.ts';
import { JUDGEMENT_LABELS, topicColumns, topicSubtopics } from './data.ts';
import { loadTopic } from './loader.ts';
import { sortTopicAreaTable, topicAreaTableModel } from './table-models.ts';

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
    : dataCsv(data, topic.slug, url.searchParams);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${topic.slug}-${areasTab ? 'area-summaries' : 'data'}.csv"`,
    },
  });
}

function dataCsv(
  data: NonNullable<Awaited<ReturnType<typeof loadTopic>>['content']>['data'],
  topicSlug: string,
  params: URLSearchParams,
) {
  const model = comparisonTable(data.selected, data.benchmarkGeography, 'none');
  const byId = new Map(data.selected.map((entry) => [entry.detail.shortId, entry]));
  const columns = topicColumns(params);
  const measures = columns.filter((column) =>
    ['trend', 'count', 'numerator', 'value'].includes(column),
  );
  const dataAreas = [...model.areas].sort((a, b) =>
    a.areaCode === 'E92000001'
      ? -1
      : b.areaCode === 'E92000001'
        ? 1
        : a.areaName.localeCompare(b.areaName),
  );
  return tableCsv([
    [
      'Indicator',
      'Subtopic',
      'Unit',
      ...(columns.includes('period') ? ['Most recent period'] : []),
      ...(columns.includes('updated') ? ['Last updated'] : []),
      ...dataAreas.flatMap(({ areaName }) =>
        measures.map(
          (measure) =>
            `${areaName} ${measure === 'trend' ? 'trend (last 5 periods)' : measure === 'count' || measure === 'numerator' ? measure : 'calculated value'}`,
        ),
      ),
    ],
    ...model.rows.flatMap((row) => {
      const entry = byId.get(row.shortId);
      if (!entry) return [];
      return [
        [
          row.name + (row.suffix ? ` ${row.suffix}` : ''),
          topicSubtopics(entry, topicSlug).join('; '),
          row.unit,
          ...(columns.includes('period') ? [row.period || 'No data'] : []),
          ...(columns.includes('updated')
            ? [
                entry.detail.dataUpdatedAt
                  ? formatDate(entry.detail.dataUpdatedAt, 'short')
                  : 'Not known',
              ]
            : []),
          ...dataAreas.flatMap(({ areaCode }) =>
            measures.map((measure) => {
              const cell = row.cells.find((cell) => cell.areaCode === areaCode);
              return measure === 'trend'
                ? recentTrend(cell?.series ?? [], entry.detail.polarity, cell?.trendDirection).label
                : measure === 'count' || measure === 'numerator'
                  ? (cell?.[measure] ?? null)
                  : (cell?.value ?? null);
            }),
          ),
        ],
      ];
    }),
  ]);
}
