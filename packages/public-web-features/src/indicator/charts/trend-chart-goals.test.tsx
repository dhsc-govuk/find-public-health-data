// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { cloneElement, type ReactElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { benchmarkFixture } from '../benchmark.testing.ts';
import { trendChartAreas, trendTableModel } from '../trend.ts';
import { TrendChart } from './trend-chart.tsx';

vi.mock('./chart-elements.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chart-elements.tsx')>()),
  ChartCanvas: ({ children }: { children: (id: string) => ReactElement }) =>
    cloneElement(children('description') as ReactElement<{ width: number; height: number }>, {
      width: 800,
      height: 400,
    }),
}));

afterEach(cleanup);

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
