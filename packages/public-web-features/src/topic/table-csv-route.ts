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
  topicAreaJudgement,
  topicColumns,
  topicJudgement,
  topicSubtopics,
} from './data.ts';
import { loadTopic } from './loader.ts';

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
  const englandMeasures = model.hasPickedAreas
    ? measures.filter((measure) => measure !== 'trend')
    : [];
  const measureLabel = (measure: (typeof measures)[number]) =>
    measure === 'trend'
      ? 'trend (last 5 periods)'
      : measure === 'count' || measure === 'numerator'
        ? measure
        : 'calculated value';
  const dataAreas = [...model.areas].sort((a, b) =>
    a.areaCode === 'E92000001'
      ? -1
      : b.areaCode === 'E92000001'
        ? 1
        : a.areaName.localeCompare(b.areaName),
  );
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
    : tableCsv([
        [
          'Indicator',
          'Subtopic',
          'Unit',
          ...(columns.includes('period') ? ['Most recent period'] : []),
          ...(columns.includes('updated') ? ['Last updated'] : []),
          ...dataAreas.flatMap(({ areaName }) => [
            ...measures.map((measure) => `${areaName} ${measureLabel(measure)}`),
            ...(model.hasPickedAreas
              ? [`${areaName} period`, `${areaName} comparison summary`]
              : []),
          ]),
          ...englandMeasures.map((measure) => `England ${measureLabel(measure)}`),
        ],
        ...model.rows.flatMap((row) => {
          const entry = byId.get(row.shortId);
          if (!entry) return [];
          const england = englandObservation(entry, row);
          return [
            [
              row.name + (row.suffix ? ` ${row.suffix}` : ''),
              topicSubtopics(entry, topic.slug).join('; '),
              row.unit,
              ...(columns.includes('period') ? [row.period || 'No data'] : []),
              ...(columns.includes('updated')
                ? [
                    entry.detail.dataUpdatedAt
                      ? formatDate(entry.detail.dataUpdatedAt, 'short')
                      : 'Not known',
                  ]
                : []),
              ...dataAreas.flatMap(({ areaCode }) => {
                const cell = row.cells.find((cell) => cell.areaCode === areaCode);
                return [
                  ...measures.map((measure) =>
                    measure === 'trend'
                      ? recentTrend(cell?.series ?? [], entry.detail.polarity, cell?.trendDirection)
                          .label
                      : measure === 'count' || measure === 'numerator'
                        ? (cell?.[measure] ?? null)
                        : (cell?.value ?? null),
                  ),
                  ...(model.hasPickedAreas
                    ? [
                        observationPeriod(entry, cell?.series.at(-1)),
                        cell?.value == null
                          ? 'No data'
                          : comparisonSummary(topicAreaJudgement(entry, row, cell)),
                      ]
                    : []),
                ];
              }),
              ...englandMeasures.map((measure) =>
                measure === 'count' || measure === 'numerator'
                  ? (england?.[measure] ?? null)
                  : (england?.value ?? null),
              ),
            ],
          ];
        }),
      ]);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${topic.slug}-${areasTab ? 'area-summaries' : 'data'}.csv"`,
    },
  });
}
