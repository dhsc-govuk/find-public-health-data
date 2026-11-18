// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { cloneElement, type ReactElement, type Ref } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { indicatorDetail, observation } from '../view.testing.ts';
import { TrendChart, trendTitleLines } from './trend-chart.tsx';

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

it.each([
  [[null, 0, 12, null], 'England: 12.0% in 2022, up from 0.0% in 2021.'],
  [[null, 12, 0, null], 'England: 0.0% in 2022, down from 12.0% in 2021.'],
  [[null, 0, 0, null], 'England: 0.0% in 2022, the same as 0.0% in 2021.'],
  [[null, 0, null, null], 'England: 0.0% in 2021.'],
] as const)('summarises numeric endpoints around null gaps: %j', (values, summary) => {
  render(
    <TrendChart
      id="trend"
      title="Trend"
      indicator={indicatorDetail()}
      areas={[
        {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: values.map((value, index) => ({
            ...observation(),
            value,
            fromDate: `${2020 + index}-01-01`,
            toDate: `${2020 + index}-12-31`,
          })),
        },
      ]}
    />,
  );
  expect(screen.getByText(summary)).toBeTruthy();
});

it('does not describe a direction for an entirely null series', () => {
  const { container } = render(
    <TrendChart
      id="trend"
      title="Trend"
      indicator={indicatorDetail()}
      areas={[
        {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: [{ ...observation(), value: null }],
        },
      ]}
    />,
  );
  expect(screen.getByText('No data matches the selected options.')).toBeTruthy();
  expect(container.textContent).not.toMatch(/up from|down from|the same as/);
});

it('wraps the y-axis title only when it exceeds the chart width', () => {
  const title = 'Under 75 mortality rate from all causes (per 100,000)';
  expect(trendTitleLines(title, 700)).toEqual([title]);
  const lines = trendTitleLines(title, 345);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.join(' ')).toBe(title);
  expect(lines.every((line) => line.length <= Math.floor((345 - 16) / 7.4))).toBe(true);
});

it.each([
  ['calendar', '2024-01-01', '2024-12-31', 'Year'],
  ['financial', '2024-04-01', '2025-03-31', 'Financial year'],
  ['calendar', '2022-01-01', '2024-12-31', 'Period'],
  ['rolling', '2023-05-01', '2024-04-30', 'Period'],
] as const)('labels %s periods from %s to %s as %s', (value, fromDate, toDate, title) => {
  const { container } = render(
    <TrendChart
      id="trend"
      title="Trend"
      indicator={indicatorDetail(108, { yearType: { value, label: value } })}
      areas={[
        {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: [{ ...observation(), fromDate, toDate }],
        },
      ]}
    />,
  );
  expect(container.querySelector('.recharts-label')?.textContent).toBe(title);
});
