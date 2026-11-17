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
  similar: 'No different to',
  worse: 'Worse than',
  lower: 'Lower than',
  higher: 'Higher than',
} as const;
const height = 24;

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
  const context = `${indicatorName}. Period: ${period}`;
  const label = [
    context,
    ...areaLines,
    ...benchmarkLines,
    `Range: ${chartValue(min, unit)} to ${chartValue(max, unit)}`,
  ].join('. ');
  const low = Math.min(min, benchmarkValue, value);
  const high = Math.max(max, benchmarkValue, value);
  const scale = (position: number) =>
    high === low ? width / 2 : 8 + ((position - low) / (high - low)) * (width - 16);
  const dot = scale(value);
  const tick = scale(benchmarkValue);
  const overlap = Math.abs(dot - tick) <= 6;
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
    const area = Math.abs(x - dot) <= 8;
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
      {width > 20 ? (
        <div
          className="fphd-range-plot"
          ref={plot}
          onPointerEnter={hover}
          onPointerMove={hover}
          onPointerLeave={() => setHovered([])}
        >
          <Surface width={width} height={height}>
            {p25 == null || p75 == null ? null : (
              <rect
                x={scale(p25)}
                y={3}
                width={Math.max(0, scale(p75) - scale(p25))}
                height={18}
                fill="#6f7276"
                fillOpacity={0.16}
              />
            )}
            <path
              d={`M${scale(min)} 6v12 M${scale(min)} 12H${scale(max)} M${scale(max)} 6v12`}
              fill="none"
              stroke="#b1b4b6"
              strokeWidth={1.5}
            />
            <circle cx={dot} cy={12} r={5} fill={spineColours[judgement]} />
            <path d={`M${tick} 1v22`} stroke="#ffffff" strokeWidth={5} />
            <path d={`M${tick} 1v22`} stroke="#0b0c0c" strokeWidth={2} />
            {(['benchmark', 'area'] as const).map((mark) => (
              // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: SVG marks are focusable images with descriptive tooltips.
              <rect
                role="img"
                key={mark}
                tabIndex={0}
                className="fphd-range-target"
                x={(mark === 'area' ? dot : tick) - (mark === 'area' ? 8 : 6)}
                y={0}
                width={mark === 'area' ? 16 : 12}
                height={24}
                fill="transparent"
                aria-label={[context, ...(mark === 'area' ? areaLines : benchmarkLines)].join('. ')}
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
