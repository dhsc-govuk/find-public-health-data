import { ChartSection } from '@fphd/ui';
import { periodLabel } from '@fphd/utils/period-label';
import { availablePeriodTypes, filterObservations } from '../data.ts';
import type { IndicatorAreaData, IndicatorDetail } from '../loader.ts';
import { alignedSeries, periodKey } from './chart-data.ts';
import { ChartDataTable, chartValue, NoChartData, seriesColours } from './chart-elements.tsx';

export function Sparkline({
  id,
  title,
  areas,
  indicator,
}: {
  id: string;
  title: string;
  areas: IndicatorAreaData[];
  indicator: IndicatorDetail;
}) {
  const type =
    availablePeriodTypes(areas.flatMap(({ observations }) => observations)).length > 1
      ? '3-year'
      : 'all';
  const primary = alignedSeries(
    areas.map((area) => ({
      ...area,
      observations: filterObservations(area.observations, { periodType: type }),
    })),
  ).find(({ observations }) => observations.size > 0);
  const points = [...(primary?.observations.values() ?? [])]
    .sort((a, b) => periodKey(a).localeCompare(periodKey(b)))
    .slice(-8)
    .map((observation) => ({
      key: periodKey(observation),
      label: periodLabel(observation, indicator.yearType),
      value: observation.value,
    }));
  const first = points.find(({ value }) => value !== null);
  const latest = points.findLast(({ value }) => value !== null);
  const colour = seriesColours[0];
  const values = points.flatMap(({ value }) => (value === null ? [] : [value]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const coordinates = points.map(({ value }, index) =>
    value === null
      ? null
      : {
          x: 5 + (index * 270) / Math.max(1, points.length - 1),
          y: max === min ? 28 : 51 - ((value - min) * 46) / (max - min),
        },
  );
  const lines: string[][] = [[]];
  for (const point of coordinates) {
    if (point) lines.at(-1)?.push(`${point.x.toFixed(1)},${point.y.toFixed(1)}`);
    else lines.push([]);
  }
  const last = coordinates.findLast((point) => point !== null);
  const endpoint = (point: typeof first) =>
    point ? (
      <span>
        {chartValue(point.value, indicator.unit)}
        <br />
        in {point.label}
      </span>
    ) : null;
  return (
    <ChartSection id={id} title={title}>
      {first && latest && first !== latest ? (
        <div className="fphd-sparkline">
          <svg width="100%" height="56" viewBox="0 0 280 56" preserveAspectRatio="none" role="img">
            <title>{title}</title>
            <desc>
              {points
                .map(({ label, value }) => `${label}: ${chartValue(value, indicator.unit)}`)
                .join('; ')}
            </desc>
            {lines
              .filter((line) => line.length > 1)
              .map((line, index) => (
                <polyline
                  key={index}
                  points={line.join(' ')}
                  fill="none"
                  stroke={colour}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            {last ? <circle cx={last.x} cy={last.y} r="4" fill={colour} /> : null}
          </svg>
          <p className="govuk-hint fphd-sparkline__endpoints">
            {endpoint(first)}
            {endpoint(latest)}
          </p>
          <ChartDataTable
            title={title}
            columns={['Period', primary?.name ?? 'Value']}
            rows={points.map(({ key, label, value }) => ({
              key,
              label,
              values: [chartValue(value, indicator.unit)],
            }))}
          />
        </div>
      ) : (
        <NoChartData>No trend available (not enough data).</NoChartData>
      )}
    </ChartSection>
  );
}
