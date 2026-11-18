// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { cloneElement, type ReactElement, type Ref } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { indicatorDetail, observation } from '../view.testing.ts';
import { TrendChart } from './trend-chart.tsx';

vi.mock('./chart-elements.tsx', async (original) => ({
  ...(await original<typeof import('./chart-elements.tsx')>()),
  ChartCanvas: ({
    children,
    chartRef,
  }: {
    children: (id: string) => ReactElement;
    chartRef: Ref<HTMLDivElement>;
  }) => (
    <div ref={chartRef}>
      {cloneElement(children('description') as ReactElement<{ width: number; height: number }>, {
        width: 640,
        height: 400,
      })}
    </div>
  ),
}));

afterEach(cleanup);

function chart(count: number, values = [10, 12]) {
  return render(
    <TrendChart
      id="trend"
      title="Trend"
      indicator={indicatorDetail()}
      areas={Array.from({ length: count }, (_, index) => ({
        areaCode: String(index),
        areaName: `Area ${index + 1}`,
        observations: values.map((value, year) => ({
          ...observation(value),
          fromDate: `${2023 + year}-01-01`,
          toDate: `${2023 + year}-12-31`,
        })),
      }))}
    />,
  );
}

it.each([1, 2, 8, 12])(
  'direct-labels %s series and cycles colour and shape independently',
  (count) => {
    const { container } = chart(count);
    expect(container.querySelectorAll('.fphd-chart-series-label')).toHaveLength(count);
    expect(container.querySelectorAll('.fphd-chart-point')).toHaveLength(count * 2);
    const curves = [...container.querySelectorAll('.recharts-line-curve')];
    expect(curves.map((curve) => curve.getAttribute('stroke'))).toEqual(
      Array.from(
        { length: count },
        (_, i) => ['#12436d', '#28a197', '#801650', '#f46a25', '#3d3d3d', '#a285d1'][i % 6],
      ),
    );
  },
);

it('renders one labelled marker without a curve for a single observation', () => {
  const { container } = chart(1, [12]);
  expect(container.querySelectorAll('.fphd-chart-point')).toHaveLength(1);
  expect(container.querySelectorAll('.fphd-chart-series-label')).toHaveLength(1);
  expect(container.querySelectorAll('.recharts-line-curve')).toHaveLength(0);
});

it('mutes other end labels while label hover leaves the tooltip closed', () => {
  const { container } = chart(2);
  const labels = [...container.querySelectorAll('.fphd-chart-series-label')];
  fireEvent.mouseEnter(labels[0]?.parentElement as Element);
  expect(labels[1]?.getAttribute('fill')).toBe('#b1b4b6');
  expect(screen.queryByRole('status')).toBeNull();
  const target = labels[0]?.parentElement?.querySelector('rect');
  expect(Number(target?.getAttribute('width'))).toBeGreaterThanOrEqual(110);
  expect(Number(target?.getAttribute('height'))).toBeGreaterThanOrEqual(22);
});

it('shows both identical histories at an overlapping point with opposite tooltips and only their rings', () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const { container } = chart(2);
  fireEvent.mouseEnter(container.querySelector('.fphd-chart-point') as Element);
  expect(screen.getAllByRole('status')).toHaveLength(2);
  expect(container.querySelectorAll('.fphd-chart-point-ring')).toHaveLength(2);
  expect(
    [...container.querySelectorAll('.fphd-chart-tooltip-overlay')]
      .map((box) => box.getAttribute('data-side'))
      .sort(),
  ).toEqual(['above', 'below']);
  expect(screen.getAllByRole('status').map((tooltip) => tooltip.textContent)).toEqual([
    'Value: 10.0%Period: 2023Area: Area 1',
    'Value: 10.0%Period: 2023Area: Area 2',
  ]);
  vi.unstubAllGlobals();
});
