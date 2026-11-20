import { type PointerEvent, useEffect, useId, useRef, useState } from 'react';
import { Surface } from 'recharts';
import type { BenchmarkJudgement } from '../data.ts';
import { chartValue } from './chart-elements.tsx';
import { SpineChartTooltips } from './spine-chart-tooltips.tsx';

export { SpineChartKey } from './spine-chart-key.tsx';

export const spineColours = {
  better: '#8ed973',
  similar: '#ffc000',
  worse: '#c00000',
  lower: '#bed2ff',
  higher: '#5555e6',
  none: '#6f7276',
} as const satisfies Record<BenchmarkJudgement, string>;

const comparisons = {
  better: 'Better than',
  similar: 'Similar to',
  worse: 'Worse than',
  lower: 'Lower than',
  higher: 'Higher than',
} as const;
const height = 32;
const middle = height / 2;
/** The space either side of the chart, so a dot at the far end of the range stays whole. */
const edge = 14;
/** Narrower than this leaves under 10 pixels to plot either side of the benchmark. */
const minimumWidth = 2 * (edge + 10);
const grey = '#6f7276';

export function SpineChart({
  indicatorName,
  period,
  areaName,
  benchmarkName,
  value,
  benchmarkValue,
  min,
  max,
  p25,
  p75,
  unit,
  judgement,
}: {
  indicatorName: string;
  period: string;
  areaName: string;
  benchmarkName: string;
  value: number;
  benchmarkValue: number;
  min: number;
  max: number;
  p25?: number | null | undefined;
  p75?: number | null | undefined;
  unit: string | null;
  judgement: BenchmarkJudgement;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const plot = useRef<HTMLDivElement>(null);
  const id = useId();
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<string[]>([]);
  const [focused, setFocused] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!slot.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(slot.current);
    return () => observer.disconnect();
  }, []);
  const comparison =
    judgement === 'none' ? 'No comparison available' : `${comparisons[judgement]} ${benchmarkName}`;
  const areaLines = [
    `Value: ${chartValue(value, unit)}`,
    `Area: ${areaName}`,
    `Comparison: ${comparison}`,
  ];
  const benchmarkLines = [`Value: ${chartValue(benchmarkValue, unit)}`, `Area: ${benchmarkName}`];
  // The range and the percentile band are drawn but have no tooltip of their own, so screen
  // readers get them from the area mark's label and from the text fallback.
  const rangeLines = [
    `Lowest to highest: ${chartValue(min, unit)} to ${chartValue(max, unit)}`,
    ...(p25 == null || p75 == null
      ? []
      : [`25th to 75th percentile: ${chartValue(p25, unit)} to ${chartValue(p75, unit)}`]),
  ];
  const context = `${indicatorName}. Period: ${period}`;
  const label = [context, ...areaLines, ...benchmarkLines, ...rangeLines].join('. ');
  // The benchmark sits in the middle of every chart, so a column's charts line up on it. Both
  // sides share one scale, so whichever end is further from the benchmark reaches the edge.
  const centre = width / 2;
  const reach = Math.max(
    benchmarkValue - Math.min(min, value),
    Math.max(max, value) - benchmarkValue,
  );
  const scale = (position: number) =>
    reach === 0 ? centre : centre + ((position - benchmarkValue) / reach) * (centre - edge);
  const dot = scale(value);
  const tick = scale(benchmarkValue);
  const overlap = Math.abs(dot - tick) <= 10;
  const active = dismissed
    ? []
    : [...new Set([...hovered, ...(focused ? (overlap ? ['area', 'benchmark'] : [focused]) : [])])];
  const open = active.length > 0;
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open]);
  const hover = (event: PointerEvent<HTMLDivElement>) => {
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const area = Math.abs(x - dot) <= 10;
    const benchmark = Math.abs(x - tick) <= 6;
    setHovered(
      overlap && (area || benchmark)
        ? ['area', 'benchmark']
        : [...(area ? ['area'] : []), ...(benchmark ? ['benchmark'] : [])],
    );
    setDismissed(false);
  };
  return (
    <div className="fphd-range-slot" ref={slot}>
      {width >= minimumWidth ? (
        <div
          className="fphd-range-plot"
          ref={plot}
          onPointerEnter={hover}
          onPointerMove={hover}
          onPointerLeave={() => setHovered([])}
        >
          <Surface width={width} height={height}>
            <rect
              className="fphd-range-span"
              x={scale(min)}
              y={4}
              width={Math.max(0, scale(max) - scale(min))}
              height={height - 8}
              fill="none"
              stroke={grey}
              strokeWidth={2}
              strokeDasharray="3 3"
            />
            {p25 == null || p75 == null ? null : (
              <>
                <rect
                  className="fphd-range-band"
                  x={scale(p25)}
                  y={4}
                  width={Math.max(0, scale(p75) - scale(p25))}
                  height={height - 8}
                  fill={grey}
                  fillOpacity={0.1}
                />
                <line
                  className="fphd-range-band-edge"
                  x1={scale(p25)}
                  x2={scale(p25)}
                  y1={4}
                  y2={height - 4}
                  stroke={grey}
                  strokeWidth={1.5}
                />
                <line
                  className="fphd-range-band-edge"
                  x1={scale(p75)}
                  x2={scale(p75)}
                  y1={4}
                  y2={height - 4}
                  stroke={grey}
                  strokeWidth={1.5}
                />
              </>
            )}
            <circle cx={dot} cy={middle} r={10} fill={spineColours[judgement]} />
            <line x1={tick} x2={tick} y1={2} y2={height - 2} stroke="#ffffff" strokeWidth={5.5} />
            <line
              className="fphd-range-benchmark"
              x1={tick}
              x2={tick}
              y1={2}
              y2={height - 2}
              stroke="#0b0c0c"
              strokeWidth={2.5}
            />
            {(['benchmark', 'area'] as const).map((mark) => (
              // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: SVG marks are focusable images with descriptive tooltips.
              <rect
                role="img"
                key={mark}
                tabIndex={0}
                className="fphd-range-target"
                x={(mark === 'area' ? dot : tick) - (mark === 'area' ? 10 : 6)}
                y={0}
                width={mark === 'area' ? 20 : 12}
                height={height}
                fill="transparent"
                aria-label={[
                  context,
                  ...(mark === 'area' ? [...areaLines, ...rangeLines] : benchmarkLines),
                ].join('. ')}
                aria-describedby={active.includes(mark) ? `${id}-${mark}` : undefined}
                onFocus={() => {
                  setFocused(mark);
                  setDismissed(false);
                }}
                onBlur={() => setFocused(null)}
              />
            ))}
          </Surface>
          {open ? (
            <SpineChartTooltips
              anchor={plot}
              id={id}
              title={indicatorName}
              period={period}
              area={active.includes('area') ? areaLines : undefined}
              benchmark={active.includes('benchmark') ? benchmarkLines : undefined}
              onPointerEnter={() => setHovered(active)}
              onPointerLeave={() => setHovered([])}
            />
          ) : null}
        </div>
      ) : (
        <span className="fphd-range-fallback">{label}</span>
      )}
    </div>
  );
}
