import { ChartSection } from '@fphd/ui';
import { shortPeriodLabel } from '@fphd/utils/period-label';
import { availablePeriodTypes, filterObservations, formatCalculatedValue } from '../data.ts';
import type { IndicatorAreaData, IndicatorDetail } from '../loader.ts';
import { alignedSeries, periodKey } from './chart-data.ts';
import { chartValue, NoChartData, seriesColours } from './chart-elements.tsx';

function describeTrend(points: { label: string; value: number | null }[], unit: string | null) {
  const values = points.flatMap(({ label, value }) => (value === null ? [] : [{ label, value }]));
  const first = values[0];
  const latest = values.at(-1);
  if (!first || !latest) return '';
  const peak = values.reduce((a, b) => (b.value > a.value ? b : a), first);
  const low = values.reduce((a, b) => (b.value < a.value ? b : a), first);
  const value = (point: typeof first) => chartValue(point.value, unit === '%' ? unit : null);
  const start = `${chartValue(first.value, unit)} in ${first.label}`;
  const end = `${value(latest)} in ${latest.label}`;
  const description =
    peak.value > first.value && peak.value > latest.value
      ? `rose from ${start}, peaked at ${value(peak)} in ${peak.label}, and has since decreased to ${end}`
      : low.value < first.value && low.value < latest.value
        ? `fell from ${start}, reached a low of ${value(low)} in ${low.label}, and has since increased to ${end}`
        : latest.value === first.value
          ? `unchanged at ${chartValue(first.value, unit)} from ${first.label} to ${latest.label}`
          : `${latest.value > first.value ? 'rising' : 'falling'} from ${start}, to ${end}`;
  const missing = points.filter(({ value }) => value === null).map(({ label }) => label);
  return missing.length ? `${description}. No data for ${missing.join(', ')}.` : description;
}

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
      label: shortPeriodLabel(observation, indicator.yearType),
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
          x: 4 + (index * 112) / Math.max(1, points.length - 1),
          y: max === min ? 20 : 36 - ((value - min) * 32) / (max - min),
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
        {formatCalculatedValue(point.value)}
        {indicator.unit === '%' ? '%' : null}
        {indicator.unit && indicator.unit !== '%' ? (
          <>
            <br />
            {indicator.unit}
          </>
        ) : null}
        <br />
        in {point.label}
      </span>
    ) : null;
  return (
    <ChartSection id={id} title={title}>
      {first && latest && first !== latest ? (
        <div className="fphd-sparkline">
          <svg width="100%" height="56" viewBox="0 0 120 40" role="img">
            <title>{title}</title>
            <desc>
              {`${indicator.name}, ${primary?.name}: ${describeTrend(points, indicator.unit)}`}
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
                />
              ))}
            {last ? <circle cx={last.x} cy={last.y} r="3" fill={colour} /> : null}
          </svg>
          <p className="govuk-hint fphd-sparkline__endpoints" aria-hidden="true">
            {endpoint(first)}
            {endpoint(latest)}
          </p>
        </div>
      ) : (
        <NoChartData>No trend available (not enough data).</NoChartData>
      )}
    </ChartSection>
  );
}
