import type { LoaderFunctionArgs } from 'react-router';
import {
  areaColourMode,
  areaComparisonGroups,
  areaComparisonLabel,
  areaComparisonRows,
  highlightedAreaCodes,
  observationComparisonLabel,
  orderAreaComparisonRows,
} from './area-comparison.ts';
import { availableMeasures, inequalityValueLabel, MEASURES, unitNote } from './data.ts';
import { tableCsv } from './download.ts';
import { indicatorPair } from './indicator-pair.ts';
import { inequalityTableModel } from './inequalities.ts';
import { loadIndicator } from './loader.ts';

export async function loadIndicatorViewCsv(args: LoaderFunctionArgs): Promise<Response> {
  const data = await loadIndicator(args);
  const primary = data.selected[0];
  if (!primary) throw new Response('Not Found', { status: 404 });
  const params = new URL(args.request.url).searchParams;
  const tab = params.get('tab-indicator');
  let rows: (string | number | null)[][];
  if (tab === 'areas') {
    const sort = params.get('areaSort') ?? 'descending';
    const areas = areaComparisonRows(primary, data.compareAreasData, sort);
    const colour = areaColourMode(params.get('areaColour'));
    const groups = areaComparisonGroups(areas.rows, colour);
    const ordered = orderAreaComparisonRows(
      areas.rows,
      sort,
      highlightedAreaCodes(params, data.compareAreaOptions),
    );
    rows = [
      [
        'Area',
        `Value${unitNote(primary.detail.unit)}`,
        groups.heading,
        '95% lower confidence interval',
        '95% upper confidence interval',
      ],
      ...ordered.map((cell) => [
        cell.areaName + (cell.areaCode === 'E92000001' ? ' (benchmark)' : ''),
        cell.value,
        colour === 'quintiles'
          ? (groups.labels.get(cell.areaCode) ?? '')
          : areaComparisonLabel(cell, areas.england, primary.detail),
        cell.series.at(-1)?.lowerCi95 ?? null,
        cell.series.at(-1)?.upperCi95 ?? null,
      ]),
    ];
  } else if (tab === 'compare') {
    const compared = data.selected[1];
    if (!compared) throw new Response('Not Found', { status: 404 });
    const model = indicatorPair([
      {
        ...primary,
        areaData: [
          ...primary.areaData.filter(({ areaCode }) => areaCode === 'E92000001'),
          ...data.compareAreasData,
        ],
      },
      {
        ...compared,
        areaData: [
          ...compared.areaData.filter(({ areaCode }) => areaCode === 'E92000001'),
          ...data.comparedAreasData,
        ],
      },
    ]);
    const sorted = [
      ...(model.england ? [model.england] : []),
      ...model.areas.filter(({ code }) => params.getAll('highlight').includes(code)),
    ];
    rows = [
      [
        'Area',
        `${primary.detail.name}${unitNote(primary.detail.unit)} (${model.periods[0]})`,
        `${compared.detail.name}${unitNote(compared.detail.unit)} (${model.periods[1]})`,
      ],
      ...sorted.map((cell) => [cell.name, ...cell.values]),
      ...(model.areas.length
        ? [[`${data.compareAreaGroup} (${model.areas.length} areas)`, ...model.range]]
        : []),
    ];
  } else {
    const {
      rows: breakdown,
      benchmark: benchmarkObservation,
      comparisonConfidence,
    } = inequalityTableModel(primary, params);
    const benchmark = benchmarkObservation?.value ?? null;
    const available = availableMeasures([
      ...breakdown,
      ...(benchmarkObservation ? [benchmarkObservation] : []),
    ]);
    const measures = MEASURES.filter(({ key }) => available.includes(key));
    rows = [
      [
        'Segment',
        ...measures.map(({ label }) => label),
        `Value${unitNote(primary.detail.unit)}`,
        'Compared with England',
      ],
      [
        'England',
        ...measures.map(({ key }) => benchmarkObservation?.[key] ?? null),
        benchmark,
        'Benchmark',
      ],
      ...breakdown.map((observation) => [
        inequalityValueLabel(observation),
        ...measures.map(({ key }) => observation[key]),
        observation.value,
        observationComparisonLabel(
          observation,
          benchmark,
          primary.detail,
          comparisonConfidence === '99.8' ? '99.8' : '95',
        ),
      ]),
    ];
  }
  return new Response(tableCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${primary.detail.shortId}-${tab}.csv"`,
    },
  });
}
