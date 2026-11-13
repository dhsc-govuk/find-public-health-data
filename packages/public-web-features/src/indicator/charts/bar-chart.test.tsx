// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { IndicatorAreaData, IndicatorRangePeriod, SelectedIndicator } from '../loader.ts';
import { indicatorDetail, observation } from '../view.testing.ts';
import { CompareAreasChart } from './bar-chart.tsx';

afterEach(cleanup);

const areas: IndicatorAreaData[] = [
  { areaCode: 'A', areaName: 'Area A', observations: [observation(10)] },
  { areaCode: 'B', areaName: 'Area B', observations: [observation(30)] },
];
const range: IndicatorRangePeriod = {
  fromDate: '2024-01-01',
  toDate: '2024-12-31',
  segment: '',
  min: 0,
  max: 50,
  p25: 10,
  p75: 40,
  quintileCutoffs: [10, 20, 30, 40],
};

function chart(ranges: SelectedIndicator['ranges']) {
  return render(
    <CompareAreasChart
      areas={areas}
      confidence="none"
      indicator={indicatorDetail()}
      colourByQuintile
      levelByCode={{ A: 'local-authorities', B: 'regions' }}
      ranges={ranges ?? {}}
    />,
  );
}

it.each([
  {},
  { 'local-authorities': [{ ...range, fromDate: '2023-01-01', toDate: '2023-12-31' }] },
  { 'local-authorities': [{ ...range, quintileCutoffs: null }] },
])('does not claim quintile colours when matching ranges are unavailable: %j', (ranges) => {
  chart(ranges);
  const key = screen.getByRole('list', { name: 'Quintile key' });
  expect(
    within(key)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Quintile unavailable']);
  expect(key.querySelector('rect')?.getAttribute('fill')).toBe('#505a5f');
});

it('includes the unavailable colour alongside quintiles actually used by the bars', () => {
  chart({ 'local-authorities': [range] });
  const key = screen.getByRole('list', { name: 'Quintile key' });
  expect(
    within(key)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Quintile 1 (lowest)', 'Quintile unavailable']);
});

it('shows the represented quintiles when both levels have matching ranges', () => {
  chart({ 'local-authorities': [range], regions: [range] });
  const key = screen.getByRole('list', { name: 'Quintile key' });
  expect(
    within(key)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Quintile 1 (lowest)', 'Quintile 3']);
});

it('does not add an unavailable quintile for an area without a bar in the latest period', () => {
  render(
    <CompareAreasChart
      areas={[
        areas[0] as IndicatorAreaData,
        {
          ...(areas[1] as IndicatorAreaData),
          observations: [{ ...observation(30), fromDate: '2023-01-01', toDate: '2023-12-31' }],
        },
      ]}
      confidence="none"
      indicator={indicatorDetail()}
      colourByQuintile
      levelByCode={{ A: 'local-authorities', B: 'regions' }}
      ranges={{ 'local-authorities': [range] }}
    />,
  );
  const key = screen.getByRole('list', { name: 'Quintile key' });
  expect(
    within(key)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Quintile 1 (lowest)']);
});
