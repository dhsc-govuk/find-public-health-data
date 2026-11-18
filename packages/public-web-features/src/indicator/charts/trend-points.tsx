import { type ReactNode, useState } from 'react';
import { useXAxisScale, useYAxisScale } from 'recharts';
import { PositionedChartTooltip } from './chart-elements.tsx';
import { lineColour } from './trend-labels.tsx';

export interface TrendSelection {
  index: number;
  period: string | null;
}

export function TrendPoints({
  active,
  points,
  container,
  content,
}: {
  active: TrendSelection | null;
  points: { period: string; [key: string]: string | number | number[] | null | undefined }[];
  container: HTMLDivElement | null;
  content: (index: number, period: string) => ReactNode;
}) {
  const [primarySide, setPrimarySide] = useState<'above' | 'below'>('above');
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (!x || !y || !active?.period) return null;
  const row = points.find(({ period }) => period === active.period);
  const pointX = x(active.period);
  const value = row?.[`v${active.index}`];
  if (!row || pointX == null || typeof value !== 'number') return null;
  const pointY = y(value);
  if (pointY == null) return null;
  const overlapping = Object.entries(row).flatMap(([key, value]) => {
    if (!key.startsWith('v') || typeof value !== 'number') return [];
    const index = Number(key.slice(1));
    const cy = y(value);
    return index !== active.index && cy != null && Math.abs(cy - pointY) < 6 ? [{ index, cy }] : [];
  });
  const partner = [...overlapping]
    .sort((a, b) => Math.abs(a.cy - pointY) - Math.abs(b.cy - pointY))
    .slice(0, 1);
  const selected = [{ index: active.index, cy: pointY }, ...partner];
  return (
    <g>
      {selected.map(({ index, cy }, position) => (
        <g key={index}>
          <circle
            className="fphd-chart-point-ring"
            cx={pointX}
            cy={cy}
            r={7}
            fill="none"
            stroke="#ffdd00"
            strokeWidth={3}
            pointerEvents="none"
          />
          <PositionedChartTooltip
            container={container}
            x={pointX}
            y={cy}
            colour={lineColour(index)}
            {...(position === 0
              ? { onSide: setPrimarySide }
              : { side: primarySide === 'above' ? ('below' as const) : ('above' as const) })}
          >
            {content(index, active.period as string)}
          </PositionedChartTooltip>
        </g>
      ))}
    </g>
  );
}
