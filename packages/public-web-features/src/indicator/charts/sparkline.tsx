import { ChartSection } from '@fphd/ui';
import { periodLabel } from '@fphd/utils/period-label';
import { Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { availablePeriodTypes, filterObservations } from '../data.ts';
import type { IndicatorAreaData, IndicatorDetail } from '../loader.ts';
import { alignedSeries, periodKey } from './chart-data.ts';
import {
  ChartCanvas,
  ChartDataTable,
  chartValue,
  NoChartData,
  seriesColours,
} from './chart-elements.tsx';

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
          <ChartCanvas height={56}>
            {(descriptionId) => (
              <LineChart
                accessibilityLayer
                aria-label={title}
                aria-describedby={descriptionId}
                data={points}
                margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
              >
                <XAxis hide dataKey="label" />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Line
                  dataKey="value"
                  name={primary?.name ?? 'Value'}
                  stroke={colour}
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={({ index, cx, cy }) =>
                    index === points.indexOf(latest) && cx != null && cy != null ? (
                      <circle cx={cx} cy={cy} r={4} fill={colour} />
                    ) : null
                  }
                />
                <Tooltip
                  isAnimationActive={false}
                  formatter={(value) => chartValue(Number(value), indicator.unit)}
                />
              </LineChart>
            )}
          </ChartCanvas>
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
