// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { cloneElement, type ReactElement, useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { benchmarkFixture } from '../benchmark.testing.ts';
import { trendChartAreas, trendTableModel } from '../trend.ts';
import { TrendChart } from './trend-chart.tsx';

const chartSize = vi.hoisted(() => ({ width: 800 }));

vi.mock('./chart-elements.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chart-elements.tsx')>()),
  ChartCanvas: function Canvas({
    children,
    onResize,
  }: {
    children: (id: string) => ReactElement;
    onResize?: (width: number) => void;
  }) {
    useEffect(() => onResize?.(chartSize.width), [onResize]);
    return cloneElement(
      children('description') as ReactElement<{ width: number; height: number }>,
      {
        width: chartSize.width,
        height: 400,
      },
    );
  },
}));

afterEach(() => {
  cleanup();
  chartSize.width = 800;
});

it.each([null, 6])('renders goal reference lines, key and tooltip with upper %s', async (upper) => {
  const fixture = benchmarkFixture();
  const goal = { lower: 4, upper, polarity: 'lower-is-better' as const, policyDetail: null };
  const model = trendTableModel({ ...fixture, confidence: 'none' });
  const { container } = render(
    <TrendChart
      id="trend"
      title="Trend"
      indicator={fixture.detail}
      areas={trendChartAreas(model)}
      benchmarkCodes={model.benchmarkGroups.map(({ areaCode }) => areaCode)}
      goal={goal}
    />,
  );
  await waitFor(() =>
    expect(container.querySelectorAll('.recharts-reference-line line').length).toBe(
      upper === null ? 1 : 2,
    ),
  );
  const lines = [...container.querySelectorAll('.recharts-reference-line line')];
  expect(container.querySelectorAll('line[stroke="#00703c"], line[stroke="#d4351c"]').length).toBe(
    upper === null ? 1 : 2,
  );
  expect(lines.map((line) => line.getAttribute('stroke'))).toEqual(
    upper === null ? ['#00703c'] : ['#00703c', '#d4351c'],
  );
  for (const line of lines) {
    expect(line.getAttribute('stroke-dasharray')).toBe('6 4');
    expect(line.getAttribute('stroke-width')).toBe('2');
    expect(line.getAttribute('y1')).toBe(line.getAttribute('y2'));
    expect(line.textContent).toBe(
      `Policy goal: <4% is good${upper === null ? '' : ', >6% is bad'}`,
    );
  }
  expect(screen.getByText('Policy goals')).toBeTruthy();
  expect(screen.getByText('Decile 1 (IMD 2025): 8.0%.')).toBeTruthy();
  expect(screen.getByText('Statistical neighbours (Manchester): 15.0%.')).toBeTruthy();
  expect(screen.getByText('Combined authority (Manchester): 9.0%.')).toBeTruthy();
});

it.each([800, 320])(
  'shows full benchmark labels at width %s, using the chart key on narrow screens',
  async (width) => {
    chartSize.width = width;
    const fixture = benchmarkFixture();
    const names = [
      'West Sussex',
      'Statistical neighbours (West Sussex)',
      'Combined authority (West Sussex)',
    ];
    const { container } = render(
      <TrendChart
        id="labels"
        title="Trend"
        indicator={fixture.detail}
        areas={names.map((areaName, index) => fixture.area(`area-${index}`, areaName, 4 + index))}
      />,
    );
    if (width === 320) {
      const key = await screen.findByRole('list', { name: 'Chart key' });
      expect([...key.querySelectorAll('li')].map((item) => item.textContent)).toEqual(names);
      expect(container.querySelectorAll('.fphd-chart-series-label')).toHaveLength(0);
    } else {
      await waitFor(() =>
        expect(container.querySelectorAll('.fphd-chart-series-label')).toHaveLength(3),
      );
      const labels = [...container.querySelectorAll('.fphd-chart-series-label')];
      expect(labels.map((label) => label.textContent).sort()).toEqual([...names].sort());
      for (const label of labels)
        expect(
          Number(label.getAttribute('x')) + (label.textContent?.length ?? 0) * 8.4,
        ).toBeLessThan(width);
      expect(screen.queryByRole('list', { name: 'Chart key' })).toBeNull();
    }
  },
);
