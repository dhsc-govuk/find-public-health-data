import { ChartSection } from '@fphd/ui';
import { periodLabel } from '@fphd/utils/period-label';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  Label,
  LabelList,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type BenchmarkJudgement,
  benchmarkJudgement,
  type ConfidenceLevel,
  formatValue,
  inequalityCategoryLabel,
  sameSegment,
  segmentLabel,
  segmentValuesKey,
  unitNote,
} from '../data.ts';
import type {
  IndicatorAreaData,
  IndicatorDetail,
  IndicatorObservation,
  SelectedIndicator,
} from '../loader.ts';
import {
  alignedSeries,
  areaQuintile,
  bounds,
  englandCode,
  errorOffsets,
  quintileColours,
  quintileLabel,
} from './chart-data.ts';
import {
  axisColour,
  ChartCanvas,
  ChartDataTable,
  ChartSources,
  ChartTooltip,
  chartValue,
  gridColour,
  NoChartData,
  seriesColours,
  useChartTooltip,
} from './chart-elements.tsx';

interface BarRow {
  key: string;
  name: string;
  observation: IndicatorObservation | undefined;
  comparison?: BenchmarkJudgement;
  quintile?: number | null;
}

const comparisonColours = {
  better: '#8ed973',
  worse: '#c00000',
  similar: '#ffc000',
  higher: '#5555e6',
  lower: '#bed2ff',
  none: axisColour,
} satisfies Record<BenchmarkJudgement, string>;

const comparisonText = {
  better: 'Better than England',
  worse: 'Worse than England',
  similar: 'Similar to England',
  higher: 'Higher than England',
  lower: 'Lower than England',
  none: 'Not compared with England',
} satisfies Record<BenchmarkJudgement, string>;

function ObservationBars({
  rows,
  confidence,
  indicator,
  title,
  group,
  benchmark,
  colourByQuintile = false,
  showTable = true,
}: {
  rows: BarRow[];
  confidence: ConfidenceLevel;
  indicator: IndicatorDetail;
  title: string;
  group: string;
  benchmark?: { name: string; value: number };
  colourByQuintile?: boolean;
  showTable?: boolean;
}) {
  const tooltip = useChartTooltip();
  const [active, setActive] = useState<string | null>(null);
  const [width, setWidth] = useState(640);
  const colour = ({ comparison, quintile }: BarRow) => {
    if (colourByQuintile) return quintileColours[(quintile ?? 0) - 1] ?? axisColour;
    return benchmark && comparison ? comparisonColours[comparison] : seriesColours[0];
  };
  const comparisonLabel = ({ comparison, quintile }: BarRow) => {
    if (colourByQuintile) return quintile ? quintileLabel(quintile) : 'Quintile unavailable';
    return comparisonText[comparison ?? 'none'];
  };
  const key = colourByQuintile
    ? quintileColours.map((fill, index) => ({ fill, label: quintileLabel(index + 1) }))
    : benchmark
      ? [...new Set(rows.map(({ comparison }) => comparison ?? 'none'))].map((judgement) => ({
          fill: comparisonColours[judgement],
          label: comparisonText[judgement],
        }))
      : [];
  const labelWidth = Math.min(165, Math.max(100, Math.round(width * 0.31)));
  const names = new Map(rows.map(({ key, name }) => [key, name]));
  const data = rows.map(({ key, observation }) => ({
    key,
    value: observation?.value ?? null,
    error: errorOffsets(observation?.value ?? null, bounds(observation, confidence)),
  }));
  if (!data.some(({ value }) => value !== null)) return <NoChartData />;
  const formatName = (key: string) => names.get(key) ?? key;
  const interval = (row: BarRow) => {
    const range = bounds(row.observation, confidence);
    return range ? range.map((value) => chartValue(value, indicator.unit)).join(' to ') : 'No data';
  };
  return (
    <>
      {benchmark ? (
        <p className="govuk-body-s">
          {benchmark.name}
          {showTable ? ' (dashed line)' : ''}: {chartValue(benchmark.value, indicator.unit)}
        </p>
      ) : null}
      <ChartCanvas
        chartRef={tooltip.ref}
        height={Math.max(180, data.length * 31 + 60)}
        onResize={setWidth}
      >
        {(descriptionId) => (
          <BarChart
            accessibilityLayer
            aria-label={title}
            aria-describedby={descriptionId}
            data={data}
            layout="vertical"
            margin={{ right: 68, top: 10, bottom: 5 }}
            onMouseMove={({ activeLabel }) =>
              setActive(activeLabel == null ? null : String(activeLabel))
            }
            onMouseLeave={() => setActive(null)}
            onClick={(state) => {
              if (state.isTooltipActive) tooltip.toggle();
            }}
          >
            <CartesianGrid horizontal={false} stroke={gridColour} strokeDasharray="3 3" />
            <YAxis
              type="category"
              dataKey="key"
              interval={0}
              width={labelWidth}
              tickFormatter={(key: string) => {
                const name = formatName(key);
                const characters = Math.floor((labelWidth - 10) / 7);
                return name.length > characters ? `${name.slice(0, characters - 1)}…` : name;
              }}
              axisLine={{ stroke: axisColour }}
              tickLine={false}
            />
            <XAxis
              type="number"
              domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
              tickFormatter={formatValue}
              axisLine={{ stroke: axisColour }}
              height={46}
            >
              <Label
                value={`Calculated value${unitNote(indicator.unit)}`}
                position="insideBottom"
              />
            </XAxis>
            <Tooltip
              trigger={tooltip.trigger}
              isAnimationActive={false}
              offset={14}
              content={({ active: open, label }) => {
                const row = rows.find(({ key }) => key === String(label));
                if (!open || !row) return null;
                return (
                  <ChartTooltip title={formatName(row.key)} colour={colour(row)}>
                    <div>Value: {chartValue(row.observation?.value ?? null, indicator.unit)}</div>
                    {row.observation ? (
                      <div>Period: {periodLabel(row.observation, indicator.yearType)}</div>
                    ) : null}
                    {confidence !== 'none' ? (
                      <div>
                        {confidence}% confidence interval: {interval(row)}
                      </div>
                    ) : null}
                    {benchmark || colourByQuintile ? <div>{comparisonLabel(row)}</div> : null}
                  </ChartTooltip>
                );
              }}
            />
            <Bar
              dataKey="value"
              name="Calculated value"
              fill={seriesColours[0]}
              maxBarSize={23}
              isAnimationActive={false}
              activeBar={{ stroke: '#0b0c0c', strokeWidth: 2 }}
            >
              {rows.map((row) => (
                <Cell
                  key={row.key}
                  fill={active === null || active === row.key ? colour(row) : gridColour}
                  stroke={colourByQuintile ? '#0b0c0c' : '#505a5f'}
                  strokeWidth={0.6}
                />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                className="fphd-bar-value"
                formatter={(value) =>
                  typeof value === 'number' ? chartValue(value, indicator.unit) : ''
                }
              />
              {confidence !== 'none' ? (
                <ErrorBar dataKey="error" stroke="#0b0c0c" width={3} isAnimationActive={false} />
              ) : null}
            </Bar>
            {benchmark ? (
              <ReferenceLine
                x={benchmark.value}
                ifOverflow="extendDomain"
                stroke="#0b0c0c"
                strokeDasharray={showTable ? '5 3' : ''}
                strokeWidth={2}
              />
            ) : null}
          </BarChart>
        )}
      </ChartCanvas>
      {key.length > 0 ? (
        <ul
          className="govuk-list fphd-chart-key"
          aria-label={colourByQuintile ? 'Quintile key' : 'Comparison key'}
        >
          {key.map(({ fill, label }) => (
            <li key={label}>
              <svg width="15" height="15" aria-hidden="true">
                <rect x="0.5" y="0.5" width="14" height="14" fill={fill} stroke="#0b0c0c" />
              </svg>
              {label}
            </li>
          ))}
        </ul>
      ) : null}
      {showTable ? (
        <ChartDataTable
          title={title}
          columns={[
            group,
            `Calculated value${unitNote(indicator.unit)}`,
            ...(confidence === 'none' ? [] : [`${confidence}% confidence interval`]),
            ...(colourByQuintile ? ['Quintile'] : benchmark ? ['Comparison'] : []),
          ]}
          rows={rows.map((row) => ({
            key: row.key,
            label: row.name,
            values: [
              chartValue(row.observation?.value ?? null, indicator.unit),
              ...(confidence === 'none' ? [] : [interval(row)]),
              ...(benchmark || colourByQuintile ? [comparisonLabel(row)] : []),
            ],
          }))}
        />
      ) : null}
    </>
  );
}

export function InequalitiesChart({
  id,
  observations,
  indicator,
  confidence,
  areaName,
  englandObservations,
}: {
  id: string;
  observations: IndicatorObservation[];
  indicator: IndicatorDetail;
  confidence: ConfidenceLevel;
  areaName: string;
  englandObservations: IndicatorObservation[];
}) {
  const first = observations[0];
  const dimension = first?.dimensions.find(({ dimensionClass }) => dimensionClass === 'inequality');
  const title = `Inequalities: ${indicator.name}, ${areaName}${
    first && dimension
      ? `, ${inequalityCategoryLabel(dimension.type)}, ${periodLabel(first, indicator.yearType)}`
      : ''
  }`;
  const reference =
    first &&
    englandObservations.find(
      (candidate) =>
        candidate.fromDate === first.fromDate &&
        candidate.toDate === first.toDate &&
        sameSegment(candidate, {
          ...first,
          dimensions: first.dimensions.filter(
            ({ dimensionClass }) => dimensionClass !== 'inequality',
          ),
        }),
    );
  const benchmarkValue = reference?.value ?? null;
  return (
    <ChartSection id={id} title={title}>
      <h3 className="govuk-heading-s govuk-!-margin-bottom-2">
        Chart of inequalities: {indicator.name}, {areaName}
      </h3>
      <ObservationBars
        rows={observations.map((observation) => ({
          key: segmentLabel(observation),
          name:
            observation.dimensions.find(({ type }) => type === dimension?.type)?.value ??
            segmentLabel(observation),
          observation,
          comparison: benchmarkJudgement(
            observation,
            benchmarkValue,
            indicator,
            confidence === '99.8' ? '99.8' : '95',
          ),
        }))}
        confidence={confidence}
        indicator={indicator}
        title={title}
        group="Segment"
        showTable={false}
        {...(benchmarkValue === null
          ? {}
          : { benchmark: { name: 'England', value: benchmarkValue } })}
      />
      <ChartSources indicators={[indicator]} />
    </ChartSection>
  );
}

export function CompareAreasChart({
  areas,
  confidence,
  indicator,
  colourByQuintile,
  levelByCode,
  ranges,
}: {
  areas: IndicatorAreaData[];
  confidence: ConfidenceLevel;
  indicator: IndicatorDetail;
  colourByQuintile: boolean;
  levelByCode: Record<string, string>;
  ranges: NonNullable<SelectedIndicator['ranges']>;
}) {
  const series = alignedSeries(areas);
  const local = series.filter(({ code }) => code !== englandCode);
  const england = series.find(({ code }) => code === englandCode);
  const observations = local.flatMap(({ observations }) => [...observations]);
  const latest = observations
    .filter(([, point]) => point.value !== null)
    .sort(
      ([, a], [, b]) => a.toDate.localeCompare(b.toDate) || a.fromDate.localeCompare(b.fromDate),
    )
    .at(-1);
  if (!latest)
    return (
      <NoChartData>
        {local.length === 0 ? 'Select areas to compare their values.' : undefined}
      </NoChartData>
    );
  const [period, observation] = latest;
  const benchmarkValue = england?.observations.get(period)?.value ?? null;
  const segment = segmentValuesKey(observation);
  const rows = local
    .map(({ code, name, observations }) => {
      const point = observations.get(period);
      const level = levelByCode[code];
      const range =
        colourByQuintile && level
          ? ranges[level]?.find(
              (range) =>
                range.fromDate === observation.fromDate &&
                range.toDate === observation.toDate &&
                range.segment === segment,
            )
          : undefined;
      return {
        key: code,
        name,
        observation: point,
        comparison: benchmarkJudgement(
          point,
          benchmarkValue,
          indicator,
          confidence === '99.8' ? '99.8' : '95',
        ),
        quintile: areaQuintile(point?.value, range?.quintileCutoffs),
      };
    })
    .sort((a, b) => (b.observation?.value ?? -Infinity) - (a.observation?.value ?? -Infinity));
  const title = `Compare areas: ${indicator.name}, ${periodLabel(observation, indicator.yearType)}, ${segmentLabel(observation)}`;
  return (
    <ChartSection id={`area-comparison-${indicator.shortId}`} title={title}>
      <h3 className="govuk-heading-s">{periodLabel(observation, indicator.yearType)}</h3>
      {colourByQuintile ? (
        <p className="govuk-body-s">
          Quintiles rank values across all areas of the same geography level. At least five values
          are needed, and tied values stay in the same group.
        </p>
      ) : null}
      <ObservationBars
        rows={rows}
        confidence={confidence}
        indicator={indicator}
        title={title}
        group="Area"
        colourByQuintile={colourByQuintile}
        {...(benchmarkValue === null || colourByQuintile
          ? {}
          : { benchmark: { name: 'England', value: benchmarkValue } })}
      />
      <ChartSources indicators={[indicator]} />
    </ChartSection>
  );
}
