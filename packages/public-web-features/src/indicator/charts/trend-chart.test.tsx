// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { indicatorDetail, observation } from '../view.testing.ts';
import { TrendChart } from './trend-chart.tsx';

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
