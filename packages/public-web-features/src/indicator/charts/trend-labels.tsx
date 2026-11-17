import { usePlotArea, useXAxisScale, useYAxisScale } from 'recharts';
import { axisColour, gridColour, seriesColours } from './chart-elements.tsx';

export const lineColour = (index: number) =>
  seriesColours[index % seriesColours.length] ?? axisColour;
export const labelColours = ['#12436d', '#17665f', '#801650', '#9b3714', '#3d3d3d', '#69479e'];

export function declutterLabels<T extends { pointY: number }>(labels: T[], gap = 20) {
  const sorted = labels
    .map((label) => ({ ...label, y: label.pointY }))
    .sort((a, b) => a.pointY - b.pointY);
  for (let start = 0; start < sorted.length; ) {
    let end = start + 1;
    while (end < sorted.length && (sorted[end]?.pointY ?? 0) - (sorted[end - 1]?.pointY ?? 0) < gap)
      end++;
    const cluster = sorted.slice(start, end);
    const average = cluster.reduce((sum, label) => sum + label.pointY, 0) / cluster.length;
    cluster.forEach((label, index) => {
      label.y = average + (index - (cluster.length - 1) / 2) * gap;
    });
    start = end;
  }
  return sorted;
}

export interface SeriesLabel {
  index: number;
  name: string;
  period: string;
  value: number;
}

export function EndLabels({
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
  const labels = declutterLabels(
    series.flatMap((series) => {
      const pointX = x(series.period);
      const pointY = y(series.value);
      return pointX == null || pointY == null ? [] : [{ ...series, pointX, pointY }];
    }),
  );
  const labelX = plot.x + plot.width + 10;
  return (
    <g>
      {labels.map(({ index, name, pointX, pointY, y }) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: arrow keys expose the same series selection.
        <g key={index} onMouseEnter={() => onActive(index)} onMouseLeave={() => onActive(null)}>
          <title>{name}</title>
          {Math.abs(y - pointY) > 0.01 ? (
            <line
              x1={pointX + 5}
              y1={pointY}
              x2={labelX - 3}
              y2={y}
              stroke={active === null || active === index ? lineColour(index) : gridColour}
              strokeWidth={1.5}
            />
          ) : null}
          <rect
            x={labelX - 3}
            y={y - 11}
            width={Math.max(110, labelLength * 8)}
            height={22}
            fill="transparent"
          />
          <text
            className="fphd-chart-series-label"
            fill={
              active === null || active === index
                ? labelColours[index % labelColours.length]
                : gridColour
            }
            x={labelX}
            y={y}
            dominantBaseline="central"
            style={{ fontSize: series.length > 5 ? 14 : 16 }}
          >
            {name.length > labelLength ? `${name.slice(0, labelLength - 1)}…` : name}
          </text>
        </g>
      ))}
    </g>
  );
}
