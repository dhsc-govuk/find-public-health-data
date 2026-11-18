// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ChartCanvas,
  ChartDataTable,
  ChartTooltip,
  PositionedChartTooltip,
  useChartSelection,
} from './chart-elements.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('explains how to access the values when the interactive chart cannot render', () => {
  const markup = renderToStaticMarkup(
    <ChartCanvas height={300}>{() => <div>Interactive chart</div>}</ChartCanvas>,
  );
  expect(markup).toContain('The values are available in the data table.');
  expect(markup).not.toContain('Interactive chart');
});

it('keeps repeated column names distinct when chart values change', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const table = (values: number[]) => (
    <ChartDataTable
      title="Indicators with the same name"
      columns={['Area', 'Prevalence (%)', 'Prevalence (%)']}
      rows={[{ key: 'cornwall', label: 'Cornwall', values }]}
    />
  );
  const { rerender } = render(table([10, 20]));
  rerender(table([30, 40]));
  const row = screen.getByRole('row', { name: 'Cornwall 30 40', hidden: true });
  expect(
    within(row)
      .getAllByRole('cell', { hidden: true })
      .map((cell) => cell.textContent),
  ).toEqual(['30', '40']);
  expect(
    errors.mock.calls.filter((args) => args.some((arg) => String(arg).includes('same key'))),
  ).toEqual([]);
});

it('uses the shared tooltip rows and contrasting text on light colours', () => {
  const { container, rerender } = render(
    <ChartTooltip colour="#28a197">
      <div>
        <strong>Value:</strong> 12%
      </div>
      <div>
        <strong>Area:</strong> England
      </div>
    </ChartTooltip>,
  );
  expect(screen.getByRole('status').style.color).toBe('rgb(11, 12, 12)');
  expect(container.querySelectorAll('strong')).toHaveLength(2);
  rerender(
    <ChartTooltip colour="#12436d">
      <div>
        <strong>Value:</strong> 12%
      </div>
    </ChartTooltip>,
  );
  expect(screen.getByRole('status').style.color).toBe('rgb(255, 255, 255)');
});

it('measures the current tooltip content before choosing above or below with a 40px leader', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 400 });
  document.body.append(container);
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLDivElement,
  ) {
    const rows = this.querySelector('.fphd-chart-tooltip')?.childElementCount ?? 0;
    return {
      x: 0,
      y: 0,
      width: 160,
      height: rows * 25.5 + 16,
      top: 0,
      left: 0,
      right: 160,
      bottom: rows * 25.5 + 16,
      toJSON() {},
    };
  });
  const tooltip = (rows: number) => (
    <PositionedChartTooltip container={container} x={200} y={180} colour="#12436d">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          <strong>Field:</strong> {i}
        </div>
      ))}
    </PositionedChartTooltip>
  );
  const { rerender, unmount } = render(tooltip(2));
  expect(container.querySelector('.fphd-chart-tooltip-overlay')?.getAttribute('data-side')).toBe(
    'above',
  );
  expect(container.querySelector<HTMLElement>('.fphd-chart-tooltip-position')?.style.top).toBe(
    '73px',
  );
  rerender(tooltip(6));
  expect(container.querySelector('.fphd-chart-tooltip-overlay')?.getAttribute('data-side')).toBe(
    'below',
  );
  expect(container.querySelector<HTMLElement>('.fphd-chart-tooltip-position')?.style.top).toBe(
    '220px',
  );
  expect(container.querySelector('line')?.getAttribute('y2')).toBe('220');
  unmount();
  container.remove();
  vi.unstubAllGlobals();
});

it('lets the arrow keys move a pinned selection while hover cannot', () => {
  const { result } = renderHook(() => useChartSelection<string>());
  act(() => result.current.pin('a'));
  act(() => result.current.select('b'));
  expect(result.current.active).toBe('a');
  act(() => result.current.move('c'));
  expect(result.current.active).toBe('c');
  expect(result.current.pinned).toBe(true);
});
