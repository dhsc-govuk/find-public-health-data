import { ChartSection } from '@fphd/ui';
import { shortPeriodLabel } from '@fphd/utils/period-label';
import { useCallback, useState } from 'react';
import {
  CartesianGrid,
  ErrorBar,
  getNiceTickValues,
  Label,
  Line,
  LineChart,
  ReferenceLine,
  Symbols,
  XAxis,
  YAxis,
} from 'recharts';
import { type ConfidenceLevel, formatValue, segmentLabel, unitNote } from '../data.ts';
import type { IndicatorAreaData, IndicatorPageDetail } from '../loader.ts';
import { goalThresholds, goalThresholdText, type PolicyGoal } from '../policy-goal.ts';
import { alignedSeries, bounds, chartPeriods, errorOffsets, valueExtent } from './chart-data.ts';
import {
  axisColour,
  ChartCanvas,
  ChartSources,
  chartValue,
  gridColour,
  NoChartData,
  useChartSelection,
} from './chart-elements.tsx';

import { EndLabels, lineColour } from './trend-labels.tsx';
import { TrendPoints, type TrendSelection } from './trend-points.tsx';

const shapes = ['circle', 'triangle', 'square', 'diamond', 'triangle'] as const;

const compactFormat = new Intl.NumberFormat('en-GB', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

/**
 * The y-axis's ticks: the round numbers Recharts would choose for the plotted values, any interval
 * drawn and any policy goal, worked out here so the number format can depend on them.
 */
export function trendAxisTicks(
  series: ReturnType<typeof alignedSeries>,
  confidence: ConfidenceLevel,
  goal: PolicyGoal | null | undefined,
) {
  const [lowest, highest] = valueExtent(series, confidence);
  const goals = goal ? goalThresholds(goal).map(({ value }) => value) : [];
  return getNiceTickValues([Math.min(lowest, ...goals), Math.max(highest, ...goals)], 6);
}

/**
 * The y-axis's number format. The axis is 56 pixels wide, which fits six characters, so an axis
 * with a tick that needs more shows all its numbers shortened ('57.75m', '120k').
 */
export function trendAxisFormat(ticks: number[]) {
  return ticks.some((tick) => formatValue(tick).length > 6)
    ? (value: number) => compactFormat.format(value)
    : formatValue;
}

/** Lines of at most half the chart's width, so a long title still reads as the axis's. */
export function trendTitleLines(title: string, width: number) {
  const characters = Math.max(20, Math.floor(width / 2 / 7.4));
  return title.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1);
    if (last && last.length + word.length + 1 <= characters)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
    return lines;
  }, []);
}

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

function TrendPlot({
  areas,
  benchmarkCodes,
  indicator,
  confidence,
  title,
  goal,
}: {
  areas: IndicatorAreaData[];
  benchmarkCodes: readonly string[];
  indicator: IndicatorPageDetail;
  confidence: ConfidenceLevel;
  title: string;
  goal?: PolicyGoal | null;
}) {
  const selection = useChartSelection<TrendSelection>();
  const active = selection.active?.index ?? null;
  const [width, setWidth] = useState(640);
  const [titleWidth, setTitleWidth] = useState(0);
  const titleRef = useCallback((element: SVGTextElement | null) => {
    if (!element?.getBBox) return;
    const measure = () => setTitleWidth(element.getBBox().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const yTitle = `${indicator.name}${unitNote(indicator.unit)}`;
  const yTitleLines = trendTitleLines(yTitle, width);
  const yTitleHalfWidth =
    (titleWidth || Math.max(...yTitleLines.map((line) => line.length)) * 7.4) / 2;
  const series = alignedSeries(areas).filter(({ observations }) =>
    [...observations.values()].some(({ value }) => value !== null),
  );
  const periods = chartPeriods(series, indicator.yearType);
  const primary = series[0];
  if (!primary) {
    const observations = areas.flatMap(({ observations }) => observations);
    if (!observations.length) return <NoChartData />;
    const notes = [...new Set(observations.flatMap(({ notes }) => notes.map(({ text }) => text)))];
    return (
      <NoChartData>
        Figures are not available.
        {notes.map((note) => ` ${note.endsWith('.') ? note : `${note}.`}`)}
      </NoChartData>
    );
  }
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
  const yTicks = trendAxisTicks(series, confidence, goal);
  const longest = Math.max(...series.map(({ name }) => name.length));
  const ticks = new Map(
    periods.map(({ key }) => {
      const [fromDate = '', toDate = ''] = key.split('|');
      return [key, shortPeriodLabel({ fromDate, toDate }, indicator.yearType)];
    }),
  );
  const lastTickLength = ticks.get(periods.at(-1)?.key ?? '')?.length ?? 0;
  const tickInset = Math.max(26, 8 + lastTickLength * 4.5);
  const right = narrow
    ? tickInset
    : Math.max(126, tickInset, Math.min(width * 0.4, 24 + longest * 8.4));
  const titleHeight = yTitleLines.length * 18 + 24;
  const periodAxis = periods.some(({ label }) => !/^\d{4}(\/\d{2})?$/.test(label))
    ? 'Period'
    : indicator.yearType?.value === 'financial'
      ? 'Financial year'
      : indicator.yearType?.value === 'calendar'
        ? 'Year'
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
          {series
            .filter(({ code }) => benchmarkCodes.includes(code))
            .map(({ code, name, observations }) => {
              const latest = [...observations.values()].findLast(({ value }) => value != null);
              return latest ? (
                <span key={code}>
                  {' '}
                  {name}: {chartValue(latest.value, indicator.unit)}.
                </span>
              ) : null;
            })}
        </p>
      ) : null}
      <ChartCanvas
        chartRef={selection.ref}
        height={
          Math.max(
            300,
            Math.round(width * 0.5),
            narrow ? 300 : series.length * (series.length > 8 ? 90 : 60) + 100,
          ) + Math.max(0, titleHeight - 50)
        }
        onResize={setWidth}
        instruction={
          series.length > 1
            ? 'Use the left and right arrow keys to move between periods, and the up and down arrow keys to move between series.'
            : 'Use the left and right arrow keys to move between periods.'
        }
        onKeyDown={(event) => {
          if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key))
            return;
          event.preventDefault();
          const current = selection.active ?? { index: 0, period: periods[0]?.key ?? null };
          if (event.key === 'Enter') {
            selection.pin(current);
            return;
          }
          const periodIndex = periods.findIndex(({ key }) => key === current.period);
          const index =
            event.key === 'ArrowDown'
              ? (current.index + 1) % series.length
              : event.key === 'ArrowUp'
                ? (current.index + series.length - 1) % series.length
                : current.index;
          const nextPeriod =
            event.key === 'ArrowRight'
              ? Math.min(periods.length - 1, periodIndex + 1)
              : event.key === 'ArrowLeft'
                ? Math.max(0, periodIndex - 1)
                : Math.max(0, periodIndex);
          selection.move({ index, period: periods[nextPeriod]?.key ?? null });
        }}
      >
        {(descriptionId) => (
          <LineChart
            className="fphd-line-chart"
            accessibilityLayer
            aria-label={chartTitle}
            aria-describedby={descriptionId}
            data={points}
            margin={{ top: titleHeight, right, left: 8, bottom: 8 }}
            onMouseLeave={selection.leave}
            onMouseMove={(_, event) => {
              if (
                selection.active?.period &&
                event.target instanceof Element &&
                !event.target.closest('.fphd-chart-point, .fphd-chart-tooltip')
              )
                selection.select(null);
            }}
            onClick={selection.clear}
          >
            <CartesianGrid vertical={false} stroke={gridColour} strokeDasharray="3 3" />
            <XAxis
              dataKey="period"
              axisLine={{ stroke: axisColour }}
              tickLine={{ stroke: axisColour }}
              height={50}
              interval="preserveStartEnd"
              minTickGap={24}
              tickFormatter={(period: string) => ticks.get(period) ?? period}
            >
              <Label value={periodAxis} position="insideBottom" />
            </XAxis>
            <YAxis
              domain={[yTicks[0] ?? 0, yTicks.at(-1) ?? 0]}
              ticks={yTicks}
              width={56}
              axisLine={{ stroke: axisColour }}
              tickLine={{ stroke: axisColour }}
              tickFormatter={trendAxisFormat(yTicks)}
            >
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !('x' in viewBox) || !('width' in viewBox) || !('y' in viewBox))
                    return null;
                  // The title is centred over the axis. A title too wide for that is left-aligned
                  // at the chart's left edge instead, so it never covers the page beside the chart.
                  const axisX = Number(viewBox.x) + Number(viewBox.width);
                  const centred = yTitleHalfWidth <= axisX;
                  const x = centred ? axisX : 0;
                  return (
                    <text
                      ref={titleRef}
                      className="recharts-text fphd-line-axis-title"
                      x={x}
                      y={Number(viewBox.y) - 20 - (yTitleLines.length - 1) * 18}
                      textAnchor={centred ? 'middle' : 'start'}
                    >
                      {yTitleLines.map((line, index) => (
                        <tspan key={line + index} x={x} dy={index === 0 ? 0 : 18}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  );
                }}
              />
            </YAxis>
            {goal
              ? goalThresholds(goal).map(({ value, colour }) => (
                  <ReferenceLine
                    key={`${value}-${colour}`}
                    y={value}
                    stroke={colour}
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    ifOverflow="extendDomain"
                    shape={({ x1, x2, y1, y2 }) => (
                      <line
                        x1={x1}
                        x2={x2}
                        y1={y1}
                        y2={y2}
                        stroke={colour}
                        strokeDasharray="6 4"
                        strokeWidth={2}
                      >
                        <title>Policy goal: {goalThresholdText(goal, indicator.unit)}</title>
                      </line>
                    )}
                  />
                ))
              : null}
            {series.map(({ code, name }, index) => {
              const colour = active === null || active === index ? lineColour(index) : gridColour;
              return (
                <Line
                  key={code}
                  name={name}
                  dataKey={`v${index}`}
                  stroke={colour}
                  strokeWidth={2}
                  isAnimationActive={false}
                  zIndex={active === index ? 401 : 400}
                  dot={({ cx, cy, payload }) =>
                    cx == null || cy == null ? null : (
                      // biome-ignore lint/a11y/noStaticElementInteractions: the chart's arrow keys and tooltip expose the same point.
                      <g
                        className="fphd-chart-point"
                        data-series={index}
                        data-period={String(payload.period)}
                        transform={`translate(${cx}, ${cy})${index % shapes.length === 4 ? ' rotate(180)' : ''}`}
                        onMouseEnter={() => {
                          if (
                            selection.active?.index !== index ||
                            selection.active?.period !== String(payload.period)
                          )
                            selection.select({ index, period: String(payload.period) });
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          selection.pin({ index, period: String(payload.period) });
                        }}
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
                  activeDot={false}
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
                onActive={(index) =>
                  selection.select(index === null ? null : { index, period: null })
                }
                labelLength={Math.max(6, Math.floor((right - 16) / 8))}
              />
            )}
            <TrendPoints
              active={selection.active}
              points={points}
              container={selection.ref.current}
              content={(index, period) => (
                <>
                  <div>
                    <strong>Value:</strong>{' '}
                    {chartValue(
                      series[index]?.observations.get(period)?.value ?? null,
                      indicator.unit,
                    )}
                  </div>
                  <div>
                    <strong>Period:</strong> {labels.get(period) ?? period}
                  </div>
                  <div>
                    <strong>Area:</strong> {series[index]?.name}
                  </div>
                  {confidence !== 'none' &&
                  bounds(series[index]?.observations.get(period), confidence) ? (
                    <div>
                      <strong>{confidence}% confidence interval:</strong>{' '}
                      {intervalText(period, index).replace(/^ \([^:]+: |\)$/g, '')}
                    </div>
                  ) : null}
                  {goal ? (
                    <div>
                      <strong>Policy goal:</strong> {goalThresholdText(goal, indicator.unit)}
                    </div>
                  ) : null}
                </>
              )}
            />
          </LineChart>
        )}
      </ChartCanvas>
      {narrow ? (
        <ul className="govuk-list fphd-chart-key" aria-label="Chart key">
          {series.map(({ code, name }, index) => (
            <li key={code}>
              <svg width="32" height="18" aria-hidden="true">
                <line x1="0" y1="9" x2="32" y2="9" stroke={lineColour(index)} strokeWidth={2} />
                <g transform="translate(16, 9)">
                  <SeriesMark index={index} />
                </g>
              </svg>
              {name}
            </li>
          ))}
        </ul>
      ) : null}
      {goal ? (
        <ul className="govuk-list fphd-chart-key" aria-label="Policy goals key">
          <li title={`Policy goal: ${goalThresholdText(goal, indicator.unit)}`}>
            <svg width="32" height="18" aria-hidden="true">
              {goalThresholds(goal).map(({ colour }, index) => (
                <path
                  key={colour}
                  d={`M0 ${6 + index * 6}h32`}
                  stroke={colour}
                  strokeDasharray="6 4"
                  strokeWidth={2}
                />
              ))}
            </svg>
            Policy goals
          </li>
        </ul>
      ) : null}
    </>
  );
}

export function TrendChart({
  id,
  title,
  areas,
  benchmarkCodes = [],
  indicator,
  confidence = 'none',
  goal,
}: {
  id: string;
  title: string;
  areas: IndicatorAreaData[];
  benchmarkCodes?: readonly string[];
  indicator: IndicatorPageDetail;
  confidence?: ConfidenceLevel;
  goal?: PolicyGoal | null;
}) {
  return (
    <ChartSection id={id} title={title}>
      <TrendPlot
        areas={areas}
        benchmarkCodes={benchmarkCodes}
        indicator={indicator}
        confidence={confidence}
        title={title}
        goal={goal ?? null}
      />
      <ChartSources indicators={[indicator]} />
    </ChartSection>
  );
}
