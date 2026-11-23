import type { LoaderFunctionArgs } from 'react-router';
import {
  areaColourMode,
  areaComparisonGroups,
  areaComparisonLabel,
  areaComparisonRows,
  benchmarkJudgementLabel,
  highlightedAreaCodes,
  highlightedAreaRows,
  orderAreaComparisonRows,
  statisticalNeighbourAreas,
} from './area-comparison.ts';
import {
  availableMeasures,
  calculatedValueCsvFormat,
  inequalityValueLabel,
  MEASURES,
  unitNote,
} from './data.ts';
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
  let filename = `${primary.detail.shortId}-${tab}.csv`;
  let rows: (string | number | null)[][];
  if (tab === 'areas') {
    const sort = params.get('areaSort') ?? 'descending';
    const areas = areaComparisonRows(primary, data.compareAreasData, sort);
    const colour = areaColourMode(params.get('areaColour'));
    const groups = areaComparisonGroups(areas.rows, colour);
    const hasCi = areas.rows.some((cell) => {
      const latest = cell.series.at(-1);
      return latest?.lowerCi95 != null || latest?.upperCi95 != null;
    });
    const highlighted = highlightedAreaCodes(params, data.compareAreaOptions);
    const only = statisticalNeighbourAreas(params, data.compareAreaOptions);
    const ordered = orderAreaComparisonRows(areas.rows, sort, highlighted, only);
    const chosen = highlightedAreaRows(areas.rows, highlighted, only);
    rows = [
      [
        'Area',
        `Value${unitNote(primary.detail.unit)}`,
        groups.heading,
        ...(hasCi ? ['95% lower confidence interval', '95% upper confidence interval'] : []),
      ],
      ...ordered.map((cell) => [
        cell.areaName + (cell.areaCode === 'E92000001' ? ' (benchmark)' : ''),
        cell.value,
        cell.areaCode === 'E92000001'
          ? ''
          : cell.value === null
            ? 'No data'
            : colour === 'quintiles'
              ? (groups.labels.get(cell.areaCode) ?? '')
              : areaComparisonLabel(cell, areas.england, primary.detail),
        ...(hasCi
          ? [cell.series.at(-1)?.lowerCi95 ?? null, cell.series.at(-1)?.upperCi95 ?? null]
          : []),
      ]),
    ];
    if (primary.detail.dataSource) {
      rows.push([], [`Source: ${primary.detail.dataSource.name}`]);
    }
    let caption = `Table of area comparisons: ${primary.detail.name}`;
    if (chosen.length === 1) {
      caption += `, ${chosen[0]?.areaName}`;
    } else if (chosen.length > 1) {
      caption += `, ${chosen.length} chosen areas`;
    }
    filename = `${caption
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}.csv`;
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
      sex,
    } = inequalityTableModel(primary, params);
    if (sex) {
      const sexSlug = sex
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      filename = `${primary.detail.shortId}-inequalities-${sexSlug}.csv`;
    }
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
        benchmarkJudgementLabel(observation.comparison),
      ]),
    ];
  }
  return new Response(
    tableCsv(
      rows,
      tab === 'areas' ? { excel: true, formatNumber: calculatedValueCsvFormat.format } : undefined,
    ),
    {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    },
  );
}
