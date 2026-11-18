// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SpineChart, SpineChartKey, spineColours } from './spine-chart.tsx';

const props = {
  indicatorName: 'Life expectancy',
  period: '2025',
  areaName: 'West Sussex',
  benchmarkName: 'England',
  value: 90,
  benchmarkValue: 50,
  min: 10,
  max: 110,
  p25: 30,
  p75: 80,
  unit: 'years',
  judgement: 'better' as const,
};
let resize: (entries: { contentRect: { width: number } }[]) => void;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: typeof resize) {
        resize = callback;
      }
      observe() {
        resize([{ contentRect: { width: 120 } }]);
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('exposes distinct tick and dot tooltips with indicator, period, values and named comparison', () => {
  const { container } = render(<SpineChart {...props} />);
  const [tick, dot] = container.querySelectorAll('.fphd-range-target');
  if (!tick || !dot) throw new Error('Missing chart marks');
  fireEvent.focus(tick);
  expect(screen.getAllByRole('tooltip')).toHaveLength(1);
  expect(screen.getByRole('tooltip').textContent).toBe(
    'Life expectancyPeriod: 2025Value: 50.0 yearsArea: England',
  );
  fireEvent.blur(tick);
  fireEvent.focus(dot);
  expect(screen.getByRole('tooltip').textContent).toBe(
    'Life expectancyPeriod: 2025Value: 90.0 yearsArea: West SussexComparison: Better than England',
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('gives the dot the range and percentile band in its accessible name', () => {
  const { container } = render(<SpineChart {...props} />);
  const dot = container.querySelectorAll('.fphd-range-target')[1];
  expect(dot?.getAttribute('aria-label')).toBe(
    'Life expectancy. Period: 2025. Value: 90.0 years. Area: West Sussex. Comparison: Better than England. Lowest to highest: 10.0 years to 110.0 years. 25th to 75th percentile: 30.0 years to 80.0 years',
  );
});

it('shows two tooltips when marks overlap on focus and hover', () => {
  const { container } = render(<SpineChart {...props} value={50} judgement="similar" />);
  const target = container.querySelector('.fphd-range-target');
  const plot = container.querySelector('.fphd-range-plot');
  if (!target || !plot) throw new Error('Missing chart marks');
  fireEvent.focus(target);
  expect(screen.getAllByRole('tooltip')).toHaveLength(2);
  expect(screen.getByText('Comparison: Similar to England')).toBeTruthy();
  fireEvent.blur(target);
  fireEvent.pointerEnter(plot, { clientX: 49.6 });
  expect(screen.getAllByRole('tooltip')).toHaveLength(2);
});

it('fills non-zero ranges at wide and narrow widths and keeps constant ranges finite', () => {
  const { container, rerender } = render(<SpineChart {...props} />);
  expect(container.querySelector('circle')?.getAttribute('cx')).toBe('91.2');
  expect(container.querySelector('circle')?.getAttribute('r')).toBe('5');
  act(() => resize([{ contentRect: { width: 60 } }]));
  expect(container.querySelector('svg')?.getAttribute('width')).toBe('60');
  expect(Number(container.querySelector('circle')?.getAttribute('cx'))).toBeCloseTo(43.2);
  rerender(<SpineChart {...props} min={50} max={50} value={50} />);
  expect(container.querySelector('circle')?.getAttribute('cx')).toBe('30');
});

it.each([
  ['better', '#8ed973'],
  ['similar', '#ffc000'],
  ['worse', '#c00000'],
] as const)('draws a %s circular dot', (judgement, fill) => {
  const { container } = render(<SpineChart {...props} judgement={judgement} />);
  expect(container.querySelector('circle')?.getAttribute('fill')).toBe(fill);
});

it('keeps a complete text fallback without ResizeObserver', () => {
  vi.stubGlobal('ResizeObserver', undefined);
  render(<SpineChart {...props} />);
  const fallback = screen.getByText(/Life expectancy\. Period: 2025/).textContent;
  expect(fallback).toContain('Comparison: Better than England');
  expect(fallback).toContain('Lowest to highest: 10.0 years to 110.0 years');
  expect(fallback).toContain('25th to 75th percentile: 30.0 years to 80.0 years');
});

it('keys every dot colour the chart draws, Better, Similar and Worse first', () => {
  render(<SpineChartKey />);
  expect(screen.getByText('Dot colour')).toBeTruthy();
  const items = screen.getAllByRole('listitem');
  expect(items.map((item) => item.textContent)).toEqual([
    'Better',
    'Similar',
    'Worse',
    'Lower (no better or worse)',
    'Higher (no better or worse)',
    'No comparison available',
  ]);
  expect(items.map((item) => item.querySelector('circle')?.getAttribute('fill'))).toEqual([
    spineColours.better,
    spineColours.similar,
    spineColours.worse,
    spineColours.lower,
    spineColours.higher,
    spineColours.none,
  ]);
});
