// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { cloneElement, type ReactElement, type Ref } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { indicatorDetail, observation } from '../view.testing.ts';
import { alignedSeries } from './chart-data.ts';
import { TrendChart, trendAxisFormat, trendAxisTicks, trendTitleLines } from './trend-chart.tsx';

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

it('appends each benchmark latest value to the chart summary', () => {
  render(
    <TrendChart
      id="trend"
      title="Trend"
      indicator={indicatorDetail()}
      benchmarkCodes={['E92000001', 'E12000008']}
      areas={[
        { areaCode: 'E10000032', areaName: 'West Sussex', observations: [observation(8)] },
        { areaCode: 'E92000001', areaName: 'England', observations: [observation(7.9)] },
        { areaCode: 'E12000008', areaName: 'South East', observations: [observation(7.3)] },
      ]}
    />,
  );
  const summary = screen.getByText('England: 7.9%.').closest('p');
  expect(summary?.textContent).toBe('West Sussex: 8.0% in 2024. England: 7.9%. South East: 7.3%.');
});

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
  expect(screen.getByText('Figures are not available.')).toBeTruthy();
  expect(container.textContent).not.toMatch(/up from|down from|the same as/);
});

it('wraps the y-axis title at half the chart width', () => {
  const title = 'Under 75 mortality rate from all causes (per 100,000)';
  expect(trendTitleLines(title, 1400)).toEqual([title]);
  const lines = trendTitleLines(title, 700);
  expect(lines.length).toBeGreaterThan(1);
  expect(lines.join(' ')).toBe(title);
  expect(lines.every((line) => line.length <= Math.floor(700 / 2 / 7.4))).toBe(true);
});

it("left-aligns a long y-axis title at the chart's left edge", () => {
  const name = 'Mortality for people referred to secondary mental health services (aged 18 to 74)';
  const { container } = render(
    <TrendChart
      id="trend"
      title="Trend"
      indicator={indicatorDetail(108, { name, unit: 'per 100,000' })}
      areas={[{ areaCode: 'E92000001', areaName: 'England', observations: [observation()] }]}
    />,
  );
  const title = container.querySelector('.fphd-line-axis-title');
  const lines = [...container.querySelectorAll('.fphd-line-axis-title tspan')];
  expect(lines.length).toBeGreaterThan(1);
  expect(title?.getAttribute('text-anchor')).toBe('start');
  expect(lines.map((line) => line.getAttribute('x'))).toEqual(lines.map(() => '0'));
});

it('centres a short y-axis title over the axis', () => {
  const { container } = render(
    <TrendChart
      id="trend"
      title="Trend"
      indicator={indicatorDetail(108, { name: 'Rate', unit: '%' })}
      areas={[{ areaCode: 'E92000001', areaName: 'England', observations: [observation()] }]}
    />,
  );
  const axis = container.querySelector('.recharts-yAxis .recharts-cartesian-axis-line');
  expect(axis).not.toBeNull();
  expect(container.querySelector('.fphd-line-axis-title tspan')?.getAttribute('x')).toBe(
    axis?.getAttribute('x1'),
  );
});

it('shortens y-axis numbers only on an axis with a tick that would not fit', () => {
  expect(trendAxisFormat([5, 6, 7, 8])(7.5)).toBe('7.5');
  expect(trendAxisFormat([26_000, 30_000, 36_000])(36_000)).toBe('36,000');
  const large = trendAxisFormat([56_500_000, 57_500_000, 57_750_000]);
  expect([57_750_000, 57_500_000, 56_500_000].map(large)).toEqual(['57.75m', '57.5m', '56.5m']);
  expect(trendAxisFormat([0, 50_000, 100_000])(120_000)).toBe('120k');
  expect(trendAxisFormat([-1_500_000, 0])(-1_500_000)).toBe('-1.5m');
});

it("takes the axis's ticks from the values, intervals and policy goal it shows", () => {
  const series = (values: number[]) =>
    alignedSeries([
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: values.map((value, index) => ({
          ...observation(value),
          fromDate: `${2020 + index}-01-01`,
          toDate: `${2020 + index}-12-31`,
        })),
      },
    ]);
  // The data stops at 83,000, but the round ticks reach 100,000, which needs seven characters.
  expect(trendAxisTicks(series([0, 83_000]), 'none', null).at(-1)).toBe(100_000);
  expect(
    trendAxisTicks(series([87_000, 88_000]), 'none', null).every((tick) => tick < 100_000),
  ).toBe(true);
  const goal = {
    lower: 150_000,
    upper: null,
    polarity: 'higher-is-better' as const,
    policyDetail: null,
  };
  expect(Math.max(...trendAxisTicks(series([1, 6]), 'none', goal))).toBeGreaterThanOrEqual(150_000);
  expect(Math.max(...trendAxisTicks(series([10]), '95', null))).toBeGreaterThanOrEqual(11);
});

it('shows long y-axis numbers shortened on the chart', () => {
  const { container } = render(
    <TrendChart
      id="trend"
      title="Trend"
      indicator={indicatorDetail(108, { name: 'Resident population', unit: null })}
      areas={[
        { areaCode: 'E92000001', areaName: 'England', observations: [observation(57_690_323)] },
      ]}
    />,
  );
  const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-value')].map(
    (tick) => tick.textContent ?? '',
  );
  expect(ticks.some((tick) => /^\d+(\.\d+)?m$/.test(tick))).toBe(true);
  expect(ticks.every((tick) => tick.length <= 6 || !/^[\d,.]+$/.test(tick))).toBe(true);
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

it.each([
  { areas: [] },
  { areas: [{ areaCode: 'E92000001', areaName: 'England', observations: [] }] },
])('keeps the options message for empty filter results in %j', ({ areas }) => {
  render(<TrendChart id="trend" title="Trend" indicator={indicatorDetail()} areas={areas} />);
  expect(screen.getByText('No data matches the selected options.')).toBeTruthy();
});

it('explains unavailable figures with distinct value notes from every shown area', () => {
  const notes = [
    { text: 'Value suppressed for disclosure control due to small count', category: 'Value note' },
    { text: 'Data not available', category: 'Value note' },
  ];
  render(
    <TrendChart
      id="trend"
      title="Trend"
      indicator={indicatorDetail()}
      areas={[
        {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: [{ ...observation(), value: null, notes: notes.slice(0, 1) }],
        },
        {
          areaCode: 'E12000001',
          areaName: 'North East',
          observations: [{ ...observation(), value: null, notes }],
        },
      ]}
    />,
  );
  expect(
    screen.getByText(`Figures are not available. ${notes.map(({ text }) => text).join(' ')}`),
  ).toBeTruthy();
  expect(screen.queryByText('No data matches the selected options.')).toBeNull();
});
