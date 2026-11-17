import { ChartSection } from '@fphd/ui';
import { shortPeriodLabel } from '@fphd/utils/period-label';
import { useCallback, useState } from 'react';
import { CartesianGrid, ErrorBar, Label, Line, LineChart, Symbols, XAxis, YAxis } from 'recharts';
import {
  availablePeriodTypes,
  type ConfidenceLevel,
  filterObservations,
  formatValue,
  periodTypeLabel,
  segmentLabel,
  unitNote,
} from '../data.ts';
import type { IndicatorAreaData, IndicatorPageDetail } from '../loader.ts';
import { alignedSeries, bounds, chartPeriods, errorOffsets } from './chart-data.ts';
import {
  axisColour,
  ChartCanvas,
  ChartDataTable,
  ChartSources,
  chartValue,
  gridColour,
  NoChartData,
  useChartSelection,
} from './chart-elements.tsx';

import { EndLabels, lineColour } from './trend-labels.tsx';
import { TrendPoints, type TrendSelection } from './trend-points.tsx';

const shapes = ['circle', 'triangle', 'square', 'diamond', 'triangle'] as const;

export function trendTitleLines(title: string, width: number) {
  const characters = Math.max(20, Math.floor((width - 16) / 7.4));
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
  indicator,
  confidence,
  title,
}: {
  areas: IndicatorAreaData[];
  indicator: IndicatorPageDetail;
  confidence: ConfidenceLevel;
  title: string;
}) {
  const selection = useChartSelection<TrendSelection>();
  const active = selection.active?.index ?? null;
  const [width, setWidth] = useState(640);
  const [spaceBefore, setSpaceBefore] = useState(0);
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
  const left = Math.max(8, titleWidth / 2 - spaceBefore - 56);
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
      <ChartCanvas
        chartRef={selection.ref}
        height={
          Math.max(
            300,
            Math.round(width * 0.5),
            narrow ? 300 : series.length * (series.length > 8 ? 90 : 60) + 100,
          ) + Math.max(0, titleHeight - 50)
        }
        onResize={(width) => {
          setWidth(width);
          setSpaceBefore(
            Math.max(0, (selection.ref.current?.getBoundingClientRect().left ?? 0) - 15),
          );
        }}
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
          selection.select({ index, period: periods[nextPeriod]?.key ?? null });
        }}
      >
        {(descriptionId) => (
          <LineChart
            className="fphd-line-chart"
            accessibilityLayer
            aria-label={chartTitle}
            aria-describedby={descriptionId}
            data={points}
            margin={{ top: titleHeight, right, left, bottom: 8 }}
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
              domain={['auto', 'auto']}
              tickCount={6}
              width={56}
              axisLine={{ stroke: axisColour }}
              tickLine={{ stroke: axisColour }}
              tickFormatter={formatValue}
            >
              <Label
                content={({ viewBox }) =>
                  viewBox && 'x' in viewBox && 'width' in viewBox && 'y' in viewBox ? (
                    <text
                      ref={titleRef}
                      className="recharts-text fphd-line-axis-title"
                      x={Number(viewBox.x) + Number(viewBox.width)}
                      y={Number(viewBox.y) - 20 - (yTitleLines.length - 1) * 18}
                      textAnchor="middle"
                    >
                      {yTitleLines.map((line, index) => (
                        <tspan
                          key={line + index}
                          x={Number(viewBox.x) + Number(viewBox.width)}
                          dy={index === 0 ? 0 : 18}
                        >
                          {line}
                        </tspan>
                      ))}
                    </text>
                  ) : null
                }
              />
            </YAxis>
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
  indicator: IndicatorPageDetail;
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
