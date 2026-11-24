import { ChartSection } from '@fphd/ui';
import { periodLabel } from '@fphd/utils/period-label';
import { useId, useState } from 'react';
import {
  CartesianGrid,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatValue, unitNote } from '../data.ts';
import type { IndicatorAreaData, IndicatorPageDetail } from '../loader.ts';
import { IndicatorPairTable } from '../tables/indicator-pair-table.tsx';
import { englandCode, pairedObservations, regression } from './chart-data.ts';
import {
  axisColour,
  ChartSources,
  ChartTooltip,
  chartValue,
  gridColour,
  NoChartData,
  useChartTooltip,
} from './chart-elements.tsx';
import { ScatterCanvas } from './scatter-canvas.tsx';
import { AxisTitle, fitColour, ScatterMark, scatterMarks } from './scatter-elements.tsx';
import type { ScatterComparison } from './scatter-loader.ts';

type ChartIndicator = {
  detail: Pick<IndicatorPageDetail, 'name' | 'unit' | 'yearType' | 'dataSource'>;
  areaData?: IndicatorAreaData[];
};

export function CompareIndicatorsChart({
  selected,
  scatter,
  selectedAreaCodes = [],
  group = 'Local authorities',
  only = null,
  englandOnly = false,
  sex = '',
  initialSwapped = false,
}: {
  selected: ChartIndicator[];
  selectedAreaCodes?: string[] | undefined;
  scatter?: ScatterComparison | undefined;
  group?: string;
  only?: Set<string> | null;
  /** Leaves other areas out of the chart key, when England is the only geography with data. */
  englandOnly?: boolean;
  sex?: string;
  initialSwapped?: boolean;
}) {
  const [swapped, setSwapped] = useState(initialSwapped);
  const [showRegression, setShowRegression] = useState(false);
  const regressionId = useId();
  const tooltip = useChartTooltip();
  const [x, y] = swapped ? selected : [selected[1], selected[0]];
  if (!x || !y) return null;
  const variant =
    scatter?.variants?.find((variant) => variant.sex === sex) ?? scatter?.variants?.[0];
  const source =
    variant?.points ??
    scatter?.points ??
    pairedObservations(selected[0]?.areaData ?? [], selected[1]?.areaData ?? []);
  const points = source
    .filter(({ code }) => !only || code === englandCode || only.has(code))
    .map((point) =>
      swapped
        ? point
        : { ...point, x: point.y, y: point.x, xPeriod: point.yPeriod, yPeriod: point.xPeriod },
    );
  const category = (code: string) =>
    code === englandCode ? 'england' : selectedAreaCodes.includes(code) ? 'selected' : 'other';
  const period = points.find(({ code }) => code === englandCode) ?? points[0];
  const xPeriod = period ? periodLabel(period.xPeriod, x.detail.yearType) : '';
  const yPeriod = period ? periodLabel(period.yPeriod, y.detail.yearType) : '';
  const axisSexes = swapped ? variant?.axisSexes : [...(variant?.axisSexes ?? [])].reverse();
  const name = (indicator: ChartIndicator, index: number) =>
    `${indicator.detail.name}${axisSexes?.[index] ? `, ${axisSexes[index]?.toLowerCase()}` : ''}`;
  const xName = name(x, 0),
    yName = name(y, 1);
  const xLabel = `${xName}${unitNote(x.detail.unit).replaceAll('per ', 'per\u00a0')}`,
    yLabel = `${yName}${unitNote(y.detail.unit).replaceAll('per ', 'per\u00a0')}`;
  const locals = points.filter(({ code }) => code !== englandCode);
  const highlighted = points.filter(({ code }) => category(code) === 'selected');
  // When the two indicators' latest periods differ, each name carries its own period.
  const title =
    xPeriod === yPeriod
      ? `${yName} compared with ${xName}${xPeriod ? `, ${xPeriod}` : ''}`
      : `${yName}${yPeriod ? `, ${yPeriod}` : ''} compared with ${xName}${xPeriod ? `, ${xPeriod}` : ''}`;
  const fit = showRegression ? regression(locals) : null;
  const min = Math.min(...locals.map(({ x }) => x)),
    max = Math.max(...locals.map(({ x }) => x));
  const cell = ({ code, name, ...point }: (typeof points)[number]) => ({
    code,
    name,
    values: [point.x, point.y],
    periods: [
      periodLabel(point.xPeriod, x.detail.yearType),
      periodLabel(point.yPeriod, y.detail.yearType),
    ],
  });
  const england = points.find(({ code }) => code === englandCode);
  const model = {
    periods: [xPeriod, yPeriod],
    england: england ? cell(england) : undefined,
    areas: locals.map(cell),
    range: [x, y].map((indicator, index) => {
      const values = locals.map((point) => (index ? point.y : point.x));
      return values.length
        ? `${chartValue(Math.min(...values), indicator.detail.unit)} to ${chartValue(Math.max(...values), indicator.detail.unit)}`
        : 'No data';
    }),
  };
  return (
    <ChartSection id="compare-chart-section" title="Indicator comparison scatter chart">
      {points.length === 0 ? (
        <NoChartData>No areas have values for both indicators.</NoChartData>
      ) : (
        <>
          <h2 className="govuk-heading-s govuk-!-margin-bottom-2">
            Chart of indicator comparison
            {highlighted.length
              ? `, ${highlighted.length === 1 ? highlighted[0]?.name : `${highlighted.length} chosen areas`}`
              : ''}
          </h2>
          <ScatterCanvas chartRef={tooltip.ref}>
            {(descriptionId) => (
              <ScatterChart
                width={780}
                height={560}
                accessibilityLayer
                aria-label={title}
                aria-describedby={descriptionId}
                margin={{ top: 96, right: 20, bottom: 60, left: 20 }}
                onClick={(state) => {
                  if (state.isTooltipActive) tooltip.toggle();
                }}
              >
                <CartesianGrid stroke={gridColour} strokeWidth={0.5} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name={xName}
                  domain={['auto', 'auto']}
                  tickFormatter={formatValue}
                  axisLine={{ stroke: axisColour }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={yName}
                  domain={['auto', 'auto']}
                  tickFormatter={formatValue}
                  width={60}
                  axisLine={{ stroke: axisColour }}
                />
                <AxisTitle label={yLabel} period={yPeriod} />
                <AxisTitle label={xLabel} period={xPeriod} horizontal />
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
                          {xName}: {chartValue(point.x, x.detail.unit)} (
                          {periodLabel(point.xPeriod, x.detail.yearType)})
                        </div>
                        <div>
                          {yName}: {chartValue(point.y, y.detail.unit)} (
                          {periodLabel(point.yPeriod, y.detail.yearType)})
                        </div>
                      </ChartTooltip>
                    ) : null;
                  }}
                />
                <Scatter
                  data={[...points].sort(
                    (a, b) =>
                      ['other', 'selected', 'england'].indexOf(category(a.code)) -
                      ['other', 'selected', 'england'].indexOf(category(b.code)),
                  )}
                  name="Area"
                  isAnimationActive={false}
                  shape={({ cx, cy, payload }) =>
                    cx == null || cy == null ? null : (
                      <ScatterMark cx={cx} cy={cy} kind={category(payload.code)} />
                    )
                  }
                />
                {fit ? (
                  <ReferenceLine
                    segment={[
                      { x: min, y: fit.at(min) },
                      { x: max, y: fit.at(max) },
                    ]}
                    stroke={fitColour}
                    strokeWidth={3}
                    ifOverflow="hidden"
                  />
                ) : null}
              </ScatterChart>
            )}
          </ScatterCanvas>
          <ul className="govuk-list govuk-body-s fphd-chart-key" aria-label="Chart key">
            {[
              ...(england
                ? [{ code: england.code, label: 'England', kind: 'england' as const }]
                : []),
              ...highlighted.map(({ code, name }) => ({
                code,
                label: name,
                kind: 'selected' as const,
              })),
              ...(englandOnly
                ? []
                : [
                    {
                      code: 'areas',
                      label: `${group === 'Local authorities' ? 'Upper tier local authorities' : group} (${locals.length})`,
                      kind: 'other' as const,
                    },
                  ]),
            ].map(({ code, label, kind }) => (
              <li key={code}>
                <svg width="16" height="16" aria-hidden="true">
                  <ScatterMark cx={8} cy={8} kind={kind} legend />
                </svg>
                {label}
              </li>
            ))}
            {fit ? (
              <li>
                <svg width="16" height="16" aria-hidden="true">
                  <line x1={0} y1={8} x2={16} y2={8} stroke={fitColour} strokeWidth={3} />
                </svg>
                Line of best fit (estimated), r = {fit.r.toFixed(2)}
              </li>
            ) : null}
          </ul>
          <div className="fphd-chart-actions">
            <button
              className="govuk-button govuk-button--secondary govuk-!-margin-bottom-0"
              type="button"
              onClick={() => setSwapped(!swapped)}
            >
              Swap axis
            </button>
            <div className="govuk-checkboxes govuk-checkboxes--small">
              <div className="govuk-checkboxes__item">
                <input
                  className="govuk-checkboxes__input"
                  id={regressionId}
                  type="checkbox"
                  checked={showRegression}
                  onChange={(event) => setShowRegression(event.currentTarget.checked)}
                />
                <label className="govuk-label govuk-checkboxes__label" htmlFor={regressionId}>
                  Show line of best fit and correlation (r)
                </label>
              </div>
            </div>
          </div>
          {showRegression && !fit ? (
            <p className="govuk-body-s" role="status">
              Correlation cannot be estimated from these values.
            </p>
          ) : null}
          <IndicatorPairTable
            indicators={[
              { ...x.detail, name: xName },
              { ...y.detail, name: yName },
            ]}
            model={model}
            group={group}
            highlighted={selectedAreaCodes}
            correlation={fit?.r}
            plotted={only !== null}
          />
          <ChartSources indicators={[x.detail, y.detail]} />
        </>
      )}
    </ChartSection>
  );
}
