import { ChartSection } from '@fphd/ui';
import { useState } from 'react';
import {
  CartesianGrid,
  ErrorBar,
  Label,
  Line,
  LineChart,
  Symbols,
  Tooltip,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
} from 'recharts';
import {
  availablePeriodTypes,
  type ConfidenceLevel,
  filterObservations,
  formatValue,
  periodTypeLabel,
  segmentLabel,
  unitNote,
} from '../data.ts';
import type { IndicatorAreaData, IndicatorDetail } from '../loader.ts';
import { alignedSeries, bounds, chartPeriods, errorOffsets } from './chart-data.ts';
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
  seriesDashes,
  useChartTooltip,
} from './chart-elements.tsx';

const shapes = ['circle', 'triangle', 'square', 'diamond', 'triangle'] as const;

const labelColours = ['#12436d', '#17665f', '#801650', '#9b3714', '#3d3d3d', '#69479e'];

const lineColour = (index: number) => seriesColours[index % seriesColours.length] ?? axisColour;

function SeriesMark({ index, size = 78 }: { index: number; size?: number }) {
  return (
    <g transform={index % shapes.length === 4 ? 'rotate(180)' : ''}>
      <Symbols
        cx={0}
        cy={0}
        type={shapes[index % shapes.length] ?? 'circle'}
        size={size}
        fill={lineColour(index)}
        stroke="#0b0c0c"
        strokeWidth={0.5}
      />
    </g>
  );
}

interface SeriesLabel {
  index: number;
  name: string;
  period: string;
  value: number;
}

function EndLabels({
  series,
  active,
  onActive,
  labelLength,
}: {
  series: SeriesLabel[];
  active: number | null;
  onActive: (index: number | null) => void;
  labelLength: number;
}) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  const plot = usePlotArea();
  if (!x || !y || !plot) return null;
  const gap = 19;
  const labels = series
    .flatMap((series) => {
      const pointX = x(series.period);
      const pointY = y(series.value);
      return pointX == null || pointY == null ? [] : [{ ...series, pointX, pointY, y: pointY }];
    })
    .sort((a, b) => a.pointY - b.pointY);

  for (let start = 0; start < labels.length; ) {
    let end = start + 1;
    while (end < labels.length && (labels[end]?.pointY ?? 0) - (labels[end - 1]?.pointY ?? 0) < gap)
      end++;
    const cluster = labels.slice(start, end);
    const average = cluster.reduce((sum, label) => sum + label.pointY, 0) / cluster.length;
    cluster.forEach((label, index) => {
      label.y = average + (index - (cluster.length - 1) / 2) * gap;
    });
    start = end;
  }
  let top = plot.y;
  for (const label of labels) {
    label.y = Math.max(top, label.y);
    top = label.y + gap;
  }
  let bottom = plot.y + plot.height;
  for (const label of labels.toReversed()) {
    label.y = Math.min(bottom, label.y);
    bottom = label.y - gap;
  }
  const labelX = plot.x + plot.width + 9;
  return (
    <g>
      {labels.map(({ index, name, pointX, pointY, y }) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: this highlight duplicates the non-colour series labels and data table.
        <g key={index} onMouseEnter={() => onActive(index)} onMouseLeave={() => onActive(null)}>
          <title>{name}</title>
          {Math.abs(y - pointY) > 1 || labelX - pointX > 16 ? (
            <line
              x1={pointX + 5}
              y1={pointY}
              x2={labelX - 3}
              y2={y}
              stroke={active === null || active === index ? lineColour(index) : gridColour}
            />
          ) : null}
          <rect x={labelX - 3} y={y - 10} width={labelLength * 8} height={20} fill="transparent" />
          <text
            className="fphd-chart-series-label"
            fill={labelColours[index % labelColours.length] ?? axisColour}
            x={labelX}
            y={y}
            dominantBaseline="central"
          >
            {name.length > labelLength ? `${name.slice(0, labelLength - 1)}…` : name}
          </text>
        </g>
      ))}
    </g>
  );
}

function TrendPlot({
  areas,
  indicator,
  confidence,
  title,
}: {
  areas: IndicatorAreaData[];
  indicator: IndicatorDetail;
  confidence: ConfidenceLevel;
  title: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const tooltip = useChartTooltip();
  const series = alignedSeries(areas).filter(({ observations }) =>
    [...observations.values()].some(({ value }) => value !== null),
  );
  const periods = chartPeriods(series, indicator.yearType);
  const primary = series[0];
  if (!primary) return <NoChartData />;
  const labels = new Map(periods.map(({ key, label }) => [key, label]));
  const points = periods.map(({ key: period }) => ({
    period,
    ...Object.fromEntries(
      series.flatMap(({ observations }, index) => {
        const observation = observations.get(period);
        const value = observation?.value ?? null;
        return [
          [`v${index}`, value],
          [`ci${index}`, errorOffsets(value, bounds(observation, confidence))],
        ];
      }),
    ),
  }));
  const endLabels = series.flatMap(({ name, observations }, index) => {
    const period = periods.findLast(({ key }) => observations.get(key)?.value != null)?.key;
    const value = period ? observations.get(period)?.value : null;
    return period && value != null ? [{ index, name, period, value }] : [];
  });
  const segment = primary.observations.values().next().value;
  const first = periods.find(({ key }) => primary.observations.get(key)?.value != null);
  const latest = periods.findLast(({ key }) => primary.observations.get(key)?.value != null);
  const chartTitle = `${title}${segment ? `, ${segmentLabel(segment)}` : ''}`;
  const narrow = width < 480;
  const longest = Math.max(...series.map(({ name }) => name.length));
  const lastTickLength = periods.at(-1)?.label.length ?? 0;
  const tickInset = Math.max(26, 8 + lastTickLength * 4.5);
  const right = narrow ? tickInset : Math.max(tickInset, Math.min(width * 0.4, 24 + longest * 8.4));
  const periodAxis =
    indicator.yearType?.value === 'financial'
      ? 'Financial year'
      : indicator.yearType?.value === 'calendar'
        ? 'Calendar year'
        : 'Period';
  const latestValue = latest && primary.observations.get(latest.key)?.value;
  const firstValue = first && primary.observations.get(first.key)?.value;
  const intervalText = (period: string, index: number) => {
    const interval = bounds(series[index]?.observations.get(period), confidence);
    return interval
      ? ` (${confidence}% confidence interval: ${chartValue(interval[0], indicator.unit)} to ${chartValue(interval[1], indicator.unit)})`
      : '';
  };
  return (
    <>
      <h3 className="govuk-heading-s govuk-!-margin-bottom-2">Chart: {indicator.name}</h3>
      {first && latest ? (
        <p className="govuk-body-s">
          {primary.name}:{' '}
          {chartValue(primary.observations.get(latest.key)?.value ?? null, indicator.unit)}
          {' in '}
          {latest.label}
          {first.key === latest.key
            ? ''
            : `, ${latestValue === firstValue ? 'the same as' : Number(latestValue) > Number(firstValue) ? 'up from' : 'down from'} ${chartValue(firstValue ?? null, indicator.unit)} in ${first.label}`}
          .
        </p>
      ) : null}
      <p className="govuk-body-s fphd-chart-axis-title">
        {indicator.name}
        {unitNote(indicator.unit)}
      </p>
      <ChartCanvas
        chartRef={tooltip.ref}
        height={Math.max(300, Math.round(width * 0.5), series.length * 23 + 60)}
        onResize={setWidth}
        instruction={
          series.length > 1
            ? 'Use the left and right arrow keys to move between periods, and the up and down arrow keys to move between series.'
            : 'Use the left and right arrow keys to move between periods.'
        }
        onKeyDown={(event) => {
          if (series.length < 2 || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          setActive((index) =>
            index === null
              ? step > 0
                ? 0
                : series.length - 1
              : (index + step + series.length) % series.length,
          );
        }}
      >
        {(descriptionId) => (
          <LineChart
            accessibilityLayer
            aria-label={chartTitle}
            aria-describedby={descriptionId}
            data={points}
            margin={{ top: 12, right, left: 8, bottom: 8 }}
            onClick={(state) => {
              if (state.isTooltipActive) tooltip.toggle();
            }}
          >
            <CartesianGrid vertical={false} stroke={gridColour} strokeDasharray="3 3" />
            <XAxis
              dataKey="period"
              axisLine={{ stroke: axisColour }}
              tickLine={{ stroke: axisColour }}
              height={50}
              interval="preserveStartEnd"
              minTickGap={24}
              tickFormatter={(period: string) => labels.get(period) ?? period}
            >
              <Label value={periodAxis} position="insideBottom" />
            </XAxis>
            <YAxis
              domain={['auto', 'auto']}
              tickCount={6}
              width={56}
              axisLine={{ stroke: axisColour }}
              tickLine={{ stroke: axisColour }}
              tickFormatter={formatValue}
            />
            <Tooltip
              trigger={tooltip.trigger}
              isAnimationActive={false}
              offset={16}
              content={({ active: open, label, payload }) => {
                const period = String(label);
                const selected = payload.filter(
                  (entry) => active === null || entry.dataKey === `v${active}`,
                );
                const visible = selected.length > 0 ? selected : payload;
                return open && visible.length > 0 ? (
                  <ChartTooltip
                    title={labels.get(period) ?? period}
                    colour={
                      visible.length === 1
                        ? lineColour(Number(String(visible[0]?.dataKey).slice(1)))
                        : axisColour
                    }
                  >
                    {visible.map((entry) => (
                      <div key={String(entry.dataKey)}>
                        {entry.name}: {chartValue(Number(entry.value), indicator.unit)}
                        {intervalText(period, Number(String(entry.dataKey).slice(1)))}
                      </div>
                    ))}
                  </ChartTooltip>
                ) : null;
              }}
            />
            {series.map(({ code, name }, index) => {
              const colour = active === null || active === index ? lineColour(index) : gridColour;
              return (
                <Line
                  key={code}
                  name={name}
                  dataKey={`v${index}`}
                  stroke={colour}
                  strokeWidth={2}
                  strokeDasharray={seriesDashes[index % seriesDashes.length] ?? ''}
                  isAnimationActive={false}
                  zIndex={active === index ? 401 : 400}
                  dot={({ cx, cy }) =>
                    cx == null || cy == null ? null : (
                      // biome-ignore lint/a11y/noStaticElementInteractions: the chart's arrow keys and tooltip expose the same point.
                      <g
                        transform={`translate(${cx}, ${cy})${index % shapes.length === 4 ? ' rotate(180)' : ''}`}
                        onMouseEnter={() => setActive(index)}
                        onMouseLeave={() => setActive(null)}
                      >
                        <circle r={9} fill="transparent" />
                        <Symbols
                          cx={0}
                          cy={0}
                          type={shapes[index % shapes.length] ?? 'circle'}
                          fill={colour}
                          stroke={axisColour}
                          strokeWidth={0.7}
                          size={78}
                        />
                      </g>
                    )
                  }
                  activeDot={{ r: 6, stroke: '#ffdd00', strokeWidth: 3 }}
                >
                  {confidence !== 'none' ? (
                    <ErrorBar
                      dataKey={`ci${index}`}
                      width={3}
                      stroke={colour}
                      isAnimationActive={false}
                    />
                  ) : null}
                </Line>
              );
            })}
            {narrow ? null : (
              <EndLabels
                series={endLabels}
                active={active}
                onActive={setActive}
                labelLength={Math.max(6, Math.floor((right - 16) / 8))}
              />
            )}
          </LineChart>
        )}
      </ChartCanvas>
      {narrow ? (
        <ul className="govuk-list fphd-chart-key" aria-label="Chart key">
          {series.map(({ code, name }, index) => (
            <li key={code}>
              <svg width="32" height="18" aria-hidden="true">
                <line
                  x1="0"
                  y1="9"
                  x2="32"
                  y2="9"
                  stroke={lineColour(index)}
                  strokeWidth={2}
                  strokeDasharray={seriesDashes[index % seriesDashes.length]}
                />
                <g transform="translate(16, 9)">
                  <SeriesMark index={index} />
                </g>
              </svg>
              {name}
            </li>
          ))}
        </ul>
      ) : null}
      <ChartDataTable
        title={chartTitle}
        columns={['Period', ...series.map(({ name }) => name)]}
        rows={periods.map(({ key, label }) => ({
          key,
          label,
          values: series.map(
            ({ observations }, index) =>
              `${chartValue(observations.get(key)?.value ?? null, indicator.unit)}${intervalText(key, index)}`,
          ),
        }))}
      />
    </>
  );
}

export function TrendChart({
  id,
  title,
  areas,
  indicator,
  confidence = 'none',
}: {
  id: string;
  title: string;
  areas: IndicatorAreaData[];
  indicator: IndicatorDetail;
  confidence?: ConfidenceLevel;
}) {
  const types = availablePeriodTypes(areas.flatMap(({ observations }) => observations));
  const variants = types.length > 1 ? types : (['all'] as const);
  return (
    <ChartSection id={id} title={title}>
      {variants.map((variant) => {
        const variantTitle = variants.length > 1 ? `${title}, ${periodTypeLabel(variant)}` : title;
        return (
          <div key={variant}>
            {variants.length > 1 ? (
              <h3 className="govuk-heading-s">{periodTypeLabel(variant)}</h3>
            ) : null}
            <TrendPlot
              areas={areas.map((area) => ({
                ...area,
                observations: filterObservations(area.observations, { periodType: variant }),
              }))}
              indicator={indicator}
              confidence={confidence}
              title={variantTitle}
            />
          </div>
        );
      })}
      <ChartSources indicators={[indicator]} />
    </ChartSection>
  );
}
