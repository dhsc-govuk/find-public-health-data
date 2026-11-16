import { Details } from '@fphd/ui';
import { useEffect, useRef, useState } from 'react';
import { Surface, Symbols } from 'recharts';
import type { BenchmarkJudgement } from '../data.ts';
import { chartValue } from './chart-elements.tsx';

const rangeColour = '#6f7276';
const height = 24;
const styles = {
  better: { fill: '#8ed973', shape: 'triangle', text: 'Better than benchmark' },
  worse: { fill: '#c00000', shape: 'triangle', text: 'Worse than benchmark' },
  similar: { fill: '#ffc000', shape: 'diamond', text: 'Similar to benchmark' },
  lower: { fill: '#bed2ff', shape: 'square', text: 'Lower than benchmark' },
  higher: { fill: '#5555e6', shape: 'cross', text: 'Higher than benchmark' },
  none: { fill: rangeColour, shape: 'circle', text: 'No comparison available' },
} as const satisfies Record<BenchmarkJudgement, { fill: string; shape: string; text: string }>;

function Mark({ judgement, cx, cy }: { judgement: BenchmarkJudgement; cx: number; cy: number }) {
  const { shape, fill } = styles[judgement];
  return (
    <g transform={`translate(${cx}, ${cy})${judgement === 'worse' ? ' rotate(180)' : ''}`}>
      <Symbols cx={0} cy={0} type={shape} fill={fill} stroke="#0b0c0c" strokeWidth={1} size={120} />
    </g>
  );
}

interface Values {
  value: number;
  benchmarkValue: number;
  min: number;
  max: number;
  judgement: BenchmarkJudgement;
}

function RangeBox({
  left,
  right,
  centre,
  dot,
  judgement,
  band,
}: {
  left: number;
  right: number;
  centre: number;
  dot: number;
  judgement: BenchmarkJudgement;
  band?: [number, number] | undefined;
}) {
  return (
    <g>
      <rect
        x={left}
        y={3}
        width={Math.max(1, right - left)}
        height={height - 6}
        fill="none"
        stroke={rangeColour}
        strokeWidth={1.5}
        strokeDasharray="3 3"
      />
      {band ? (
        <g>
          <rect
            x={band[0]}
            y={3}
            width={band[1] - band[0]}
            height={height - 6}
            fill={rangeColour}
            fillOpacity={0.16}
          />
          <path
            d={`M${band[0]} 3v${height - 6} M${band[1]} 3v${height - 6}`}
            stroke={rangeColour}
            strokeWidth={1.5}
          />
        </g>
      ) : null}
      <Mark judgement={judgement} cx={dot} cy={height / 2} />
      <path d={`M${centre} 1v${height - 2}`} stroke="#ffffff" strokeWidth={5} />
      <path d={`M${centre} 1v${height - 2}`} stroke="#0b0c0c" strokeWidth={2} />
    </g>
  );
}

export function SpineChart({
  valueLabel,
  benchmarkLabel,
  rangeLabel,
  value,
  benchmarkValue,
  min,
  max,
  p25,
  p75,
  unit,
  judgement,
}: Values & {
  valueLabel: string;
  benchmarkLabel: string;
  rangeLabel: string;
  p25?: number | null | undefined;
  p75?: number | null | undefined;
  unit: string | null;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!slot.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(slot.current);
    return () => observer.disconnect();
  }, []);
  const open = (focused || hovered) && !dismissed;
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open]);
  const verdict = styles[judgement].text;
  const percentiles =
    p25 == null || p75 == null
      ? []
      : [`25th percentile: ${chartValue(p25, unit)}`, `75th percentile: ${chartValue(p75, unit)}`];
  const label = [valueLabel, benchmarkLabel, rangeLabel, ...percentiles, verdict].join('. ');
  const centre = width / 2;
  const span = Math.max(
    Math.abs(min - benchmarkValue),
    Math.abs(max - benchmarkValue),
    Math.abs(value - benchmarkValue),
  );
  const scale = (position: number) =>
    span === 0 ? centre : centre + ((position - benchmarkValue) / span) * (centre - 10);
  return (
    <div className="fphd-range-slot" ref={slot}>
      {width > 20 ? (
        <div
          className="fphd-range-plot"
          aria-label={label}
          role="img"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: focus exposes the same comparison tooltip as hover.
          tabIndex={0}
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
          }}
          onBlur={() => setFocused(false)}
          onPointerEnter={() => {
            setHovered(true);
            setDismissed(false);
          }}
          onPointerLeave={() => setHovered(false)}
        >
          <Surface width={width} height={height}>
            <RangeBox
              centre={centre}
              left={scale(min)}
              right={scale(max)}
              dot={scale(value)}
              judgement={judgement}
              band={p25 == null || p75 == null ? undefined : [scale(p25), scale(p75)]}
            />
          </Surface>
          {open ? (
            <span className="fphd-range-tooltip fphd-range-tooltip--above" aria-hidden="true">
              <strong>{valueLabel}</strong>
              <span>{verdict}</span>
              <span>{benchmarkLabel}</span>
              <span>{rangeLabel}</span>
              {percentiles.map((percentile) => (
                <span key={percentile}>{percentile}</span>
              ))}
            </span>
          ) : null}
        </div>
      ) : (
        <span className="fphd-range-fallback">{label}</span>
      )}
    </div>
  );
}

export function SpineChartKey() {
  return (
    <Details summary="Key to the comparison chart">
      <p className="govuk-body-s govuk-!-font-weight-bold govuk-!-margin-bottom-2">Chart</p>
      <Surface
        width={400}
        height={110}
        className="fphd-range-key-example"
        role="img"
        aria-label="Example comparison chart. The dashed box runs from the minimum to the maximum. The shaded band runs from the 25th to the 75th percentile. The black line marks the benchmark and the marker shows the area value."
      >
        <g transform="translate(0 30)">
          <RangeBox
            left={35}
            right={365}
            centre={200}
            dot={275}
            judgement="none"
            band={[115, 300]}
          />
        </g>
        <g fill="#0b0c0c" textAnchor="middle" fontSize={14}>
          <text x={275} y={17}>
            Area value
          </text>
          <text x={35} y={77}>
            Minimum
          </text>
          <text x={200} y={77}>
            Benchmark
          </text>
          <text x={365} y={77}>
            Maximum
          </text>
          <text x={115} y={100}>
            25th percentile
          </text>
          <text x={300} y={100}>
            75th percentile
          </text>
        </g>
        <path d="M275 21v13 M35 53v9 M200 53v9 M365 53v9 M115 53v33 M300 53v33" stroke="#505a5f" />
      </Surface>
      <p className="govuk-body-s">
        The dashed box shows the full range for areas of the same type. The shaded band shows the
        middle 50% of values.
      </p>
      <p className="govuk-body-s govuk-!-font-weight-bold govuk-!-margin-bottom-2">
        Marker colour and shape
      </p>
      <ul className="govuk-list fphd-range-key">
        {Object.entries(styles).map(([judgement, { text }]) => (
          <li key={judgement}>
            <svg aria-hidden="true" width="23" height="18">
              <Mark judgement={judgement as BenchmarkJudgement} cx={11} cy={9} />
            </svg>
            {text}
          </li>
        ))}
      </ul>
    </Details>
  );
}
