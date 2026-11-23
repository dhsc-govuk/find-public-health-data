import {
  type KeyboardEventHandler,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ResponsiveContainer } from 'recharts';
import { formatCalculatedValue, withUnit } from '../data.ts';
import type { IndicatorPageDetail } from '../loader.ts';
import { sourceLink } from '../metadata.tsx';

export const axisColour = '#505a5f';
export const gridColour = '#b1b4b6';
export const seriesColours = [
  '#12436d',
  '#28a197',
  '#801650',
  '#f46a25',
  '#3d3d3d',
  '#a285d1',
] as const;

export function ChartTooltip({
  title,
  colour,
  children,
}: {
  title?: string;
  colour: string;
  children: ReactNode;
}) {
  const [red = 0, green = 0, blue = 0] = (colour.match(/[\da-f]{2}/gi) ?? []).map((hex) => {
    const component = Number.parseInt(hex, 16) / 255;
    return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return (
    <div
      className="fphd-chart-tooltip"
      role="status"
      style={{ backgroundColor: colour, color: luminance > 0.179 ? '#0b0c0c' : '#ffffff' }}
      onMouseMove={(event) => event.stopPropagation()}
    >
      {title ? <strong>{title}</strong> : null}
      {children}
    </div>
  );
}

export function PositionedChartTooltip({
  container,
  x,
  y,
  colour,
  children,
  side,
  onSide,
}: {
  container: HTMLDivElement | null;
  x: number;
  y: number;
  colour: string;
  children: ReactNode;
  side?: 'above' | 'below';
  onSide?: (side: 'above' | 'below') => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, container]);
  const below = side ? side === 'below' : y - 40 - size.height < 0;
  useLayoutEffect(() => {
    onSide?.(below ? 'below' : 'above');
  }, [below, onSide]);
  if (!container) return null;
  const left = Math.max(0, Math.min(x - size.width / 2, container.clientWidth - size.width));
  const top = below ? y + 40 : y - 40 - size.height;
  return createPortal(
    <div className="fphd-chart-tooltip-overlay" data-side={below ? 'below' : 'above'}>
      <svg className="fphd-chart-tooltip-leader" aria-hidden="true">
        <line
          x1={x}
          y1={y}
          x2={Math.max(left, Math.min(x, left + size.width))}
          y2={below ? top : top + size.height}
          stroke={colour}
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      </svg>
      <div ref={ref} className="fphd-chart-tooltip-position" style={{ left, top }}>
        <ChartTooltip colour={colour}>{children}</ChartTooltip>
      </div>
    </div>,
    container,
  );
}

export function useChartSelection<T>() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<T | null>(null);
  const [pinned, setPinned] = useState(false);
  const clear = () => {
    setPinned(false);
    setActive(null);
  };
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        (!ref.current?.contains(event.target) ||
          !event.target.closest('.fphd-chart-point, .recharts-bar-rectangle, .fphd-chart-tooltip'))
      ) {
        setPinned(false);
        setActive(null);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false);
        setActive(null);
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, []);
  return {
    ref,
    active,
    pinned,
    clear,
    select: (value: T | null) => {
      if (!pinned) setActive(value);
    },
    // Arrow keys move the selection even while it is pinned, and a pinned one stays pinned.
    move: (value: T) => setActive(value),
    pin: (value: T) => {
      setActive(value);
      setPinned(true);
    },
    leave: () => {
      if (!pinned) setActive(null);
    },
  };
}

export function chartValue(value: number | null, unit: string | null) {
  return value === null ? 'No data' : withUnit(formatCalculatedValue(value), unit);
}

export function useChartTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!pinned) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) setPinned(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [pinned]);
  return {
    ref,
    trigger: pinned ? ('click' as const) : ('hover' as const),
    toggle: () => setPinned(!pinned),
  };
}

export function ChartCanvas({
  children,
  height,
  chartRef,
  onResize,
  onKeyDown,
  instruction = 'Use the left and right arrow keys to explore the chart.',
}: {
  children: (descriptionId: string) => ReactNode;
  height: number;
  chartRef?: React.Ref<HTMLDivElement>;
  onResize?: (width: number, height: number) => void;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  instruction?: string;
}) {
  const id = useId();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(typeof ResizeObserver !== 'undefined'), []);
  return ready ? (
    // biome-ignore lint/a11y/noStaticElementInteractions: handles series navigation from the chart inside.
    <div className="fphd-chart-canvas" ref={chartRef} onKeyDown={onKeyDown}>
      <p className="govuk-visually-hidden" id={id}>
        {instruction}
      </p>
      <ResponsiveContainer
        height={height}
        width="100%"
        minWidth={0}
        {...(onResize ? { onResize } : {})}
      >
        {children(id)}
      </ResponsiveContainer>
    </div>
  ) : (
    <p className="govuk-body">
      The interactive chart is unavailable. The values are available in the data table.
    </p>
  );
}

export function ChartSources({
  indicators,
}: {
  indicators: Pick<IndicatorPageDetail, 'dataSource'>[];
}) {
  const sources = new Map(
    indicators.flatMap(({ dataSource }) =>
      dataSource ? [[dataSource.name, dataSource] as const] : [],
    ),
  );
  return sources.size > 0 ? (
    <p className="govuk-body-s fphd-chart-source">
      Source:{' '}
      {[...sources.values()].map((source, index) => (
        <span key={source.name}>
          {index ? '; ' : ''}
          {sourceLink(source)}
        </span>
      ))}
    </p>
  ) : null;
}

export function NoChartData({
  children = 'No data matches the selected options.',
}: {
  children?: ReactNode;
}) {
  return <p className="govuk-body">{children}</p>;
}
