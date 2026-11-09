import { ChartSection } from '@fphd/ui';
import { periodLabel } from '@fphd/utils/period-label';
import { useState } from 'react';
import {
  CartesianGrid,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Symbols,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatValue, unitNote } from '../data.ts';
import type { SelectedIndicator } from '../loader.ts';
import { englandCode, pairedObservations, regression } from './chart-data.ts';
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
import type { ScatterComparison } from './scatter-loader.ts';

const scatterMarks = {
  england: { shape: 'circle', fill: seriesColours[0], size: 105, label: 'England' },
  selected: { shape: 'triangle', fill: seriesColours[2], size: 105, label: 'Selected areas' },
  other: { shape: 'circle', fill: '#bfbfbf', size: 44, label: 'Other areas' },
} as const;

export function CompareIndicatorsChart({
  selected,
  scatter,
  selectedAreaCodes = [],
}: {
  selected: SelectedIndicator[];
  selectedAreaCodes?: string[] | undefined;
  scatter?: ScatterComparison | undefined;
}) {
  const [swapped, setSwapped] = useState(false);
  const [showRegression, setShowRegression] = useState(false);
  const tooltip = useChartTooltip();
  const [x, y] = swapped ? [selected[1], selected[0]] : selected;
  if (!x || !y) return null;
  const points = scatter
    ? swapped
      ? scatter.points.map((point) => ({ ...point, x: point.y, y: point.x }))
      : scatter.points
    : pairedObservations(x.areaData, y.areaData);
  const category = (code: string) =>
    code === englandCode ? 'england' : selectedAreaCodes.includes(code) ? 'selected' : 'other';
  const groups = [...new Set(points.map(({ code }) => category(code)))];
  const period = points[0]?.period;
  const formatPeriod = (yearType: typeof x.detail.yearType) => {
    return points[0] ? periodLabel(points[0], yearType) : '';
  };
  const xPeriod = formatPeriod(x.detail.yearType);
  const yPeriod = formatPeriod(y.detail.yearType);
  const periodText = xPeriod === yPeriod ? xPeriod : `${xPeriod} / ${yPeriod}`;
  const xLabel = `${x.detail.name}${unitNote(x.detail.unit)}`;
  const yLabel = `${y.detail.name}${unitNote(y.detail.unit)}`;
  const title = `${y.detail.name} compared with ${x.detail.name}${period ? `, ${periodText}` : ''}`;
  const locals = points.filter(({ code }) => code !== englandCode);
  const fit = regression(locals);
  const min = Math.min(...locals.map(({ x }) => x));
  const max = Math.max(...locals.map(({ x }) => x));
  const comparableFit = fit && fit.adjustedRSquared >= 0.5 ? fit : null;
  return (
    <ChartSection id="compare-chart-section" title={title}>
      {points.length === 0 ? (
        <NoChartData>No values for these indicators match by area and period.</NoChartData>
      ) : (
        <>
          <h3 className="govuk-heading-s govuk-!-margin-bottom-2">{title}</h3>
          {scatter?.defaultGeographies ? (
            <p className="govuk-body-s">
              Showing England and upper-tier local authorities with data for both indicators.
            </p>
          ) : null}
          <div className="fphd-chart-actions">
            <button
              className="govuk-button govuk-button--secondary"
              type="button"
              onClick={() => setSwapped(!swapped)}
            >
              Swap axes
            </button>
            {comparableFit ? (
              <button
                className="govuk-button govuk-button--secondary"
                aria-pressed={showRegression}
                type="button"
                onClick={() => setShowRegression(!showRegression)}
              >
                Show regression line
              </button>
            ) : null}
          </div>
          {showRegression && comparableFit ? (
            <p className="govuk-body-s">
              R² = {comparableFit.rSquared.toFixed(2)}. The regression excludes England.
            </p>
          ) : null}
          <p className="govuk-body-s fphd-chart-axis-title">{yLabel}</p>
          <ChartCanvas chartRef={tooltip.ref} height={400}>
            {(descriptionId) => (
              <ScatterChart
                accessibilityLayer
                aria-label={title}
                aria-describedby={descriptionId}
                margin={{ top: 15, right: 24, bottom: 12 }}
                onClick={(state) => {
                  if (state.isTooltipActive) tooltip.toggle();
                }}
              >
                <CartesianGrid stroke={gridColour} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={x.detail.name}
                  domain={['auto', 'auto']}
                  tickFormatter={formatValue}
                  axisLine={{ stroke: axisColour }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={y.detail.name}
                  domain={['auto', 'auto']}
                  tickFormatter={formatValue}
                  width={54}
                  axisLine={{ stroke: axisColour }}
                />
                <Tooltip
                  trigger={tooltip.trigger}
                  isAnimationActive={false}
                  offset={16}
                  content={({ active, payload }) => {
                    const point = payload?.[0]?.payload?.payload ?? payload?.[0]?.payload;
                    return active && point?.name ? (
                      <ChartTooltip
                        title={point.name}
                        colour={scatterMarks[category(point.code)].fill}
                      >
                        <div>
                          {x.detail.name}: {chartValue(point.x, x.detail.unit)}
                        </div>
                        <div>
                          {y.detail.name}: {chartValue(point.y, y.detail.unit)}
                        </div>
                        <div>Period: {periodText}</div>
                      </ChartTooltip>
                    ) : null;
                  }}
                />
                <Scatter
                  data={points}
                  name="Area"
                  fill={seriesColours[0]}
                  isAnimationActive={false}
                  shape={({ cx, cy, payload }) => {
                    if (cx == null || cy == null) return null;
                    const { shape, fill, size } = scatterMarks[category(payload.code)];
                    return (
                      <Symbols
                        cx={cx}
                        cy={cy}
                        type={shape}
                        fill={fill}
                        stroke={axisColour}
                        size={size}
                      />
                    );
                  }}
                />
                {showRegression && comparableFit ? (
                  <ReferenceLine
                    segment={[
                      { x: min, y: comparableFit.at(min) },
                      { x: max, y: comparableFit.at(max) },
                    ]}
                    stroke={axisColour}
                    strokeDasharray="6 4"
                    strokeWidth={2}
                    ifOverflow="extendDomain"
                  />
                ) : null}
              </ScatterChart>
            )}
          </ChartCanvas>
          <p className="govuk-body-s fphd-chart-axis-title fphd-scatter-axis-title">{xLabel}</p>
          <ul className="govuk-list fphd-chart-key" aria-label="Chart key">
            {groups.map((group) => {
              const { shape, fill, size, label } = scatterMarks[group];
              return (
                <li key={group}>
                  <svg width="18" height="18" aria-hidden="true">
                    <Symbols
                      cx={9}
                      cy={9}
                      type={shape}
                      fill={fill}
                      stroke={axisColour}
                      size={size}
                    />
                  </svg>
                  {group === 'other' && scatter?.defaultGeographies
                    ? 'Upper-tier local authorities'
                    : label}
                </li>
              );
            })}
          </ul>
          <ChartDataTable
            title={title}
            columns={['Area', xLabel, yLabel]}
            rows={points.map(({ code, name, x: xValue, y: yValue }) => ({
              key: code,
              label: name,
              values: [chartValue(xValue, x.detail.unit), chartValue(yValue, y.detail.unit)],
            }))}
          />
          <ChartSources indicators={[x.detail, y.detail]} />
        </>
      )}
    </ChartSection>
  );
}
