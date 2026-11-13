import { Details, TableScrollRegion } from '@fphd/ui';
import {
  type KeyboardEventHandler,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { ResponsiveContainer } from 'recharts';
import { formatCalculatedValue, withUnit } from '../data.ts';
import type { IndicatorDetail } from '../loader.ts';
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
export const seriesDashes = ['', '7 3', '2 3', '7 3 2 3', '12 4', '5 2 2 2'];

export function ChartTooltip({
  title,
  colour,
  children,
}: {
  title: string;
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
      style={{ backgroundColor: colour, color: luminance > 0.179 ? '#000000' : '#ffffff' }}
      onMouseMove={(event) => event.stopPropagation()}
    >
      <strong>{title}</strong>
      {children}
    </div>
  );
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
  indicators: Pick<IndicatorDetail, 'dataSource'>[];
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

export function ChartDataTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: { key: string; label: string; values: ReactNode[] }[];
}) {
  return (
    <Details summary="View chart data as a table">
      <TableScrollRegion label={`Chart data table: ${title}`}>
        <table className="govuk-table">
          <caption className="govuk-table__caption govuk-visually-hidden">{title}</caption>
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              {columns.map((column, index) => (
                <th className="govuk-table__header" key={`${index}:${column}`} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {rows.map(({ key, label, values }) => (
              <tr className="govuk-table__row" key={key}>
                <th className="govuk-table__header" scope="row">
                  {label}
                </th>
                {values.map((value, index) => (
                  <td className="govuk-table__cell" key={`${index}:${columns[index + 1]}`}>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScrollRegion>
    </Details>
  );
}

export function NoChartData({
  children = 'No data matches the selected options.',
}: {
  children?: ReactNode;
}) {
  return <p className="govuk-body">{children}</p>;
}
