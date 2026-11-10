// @vitest-environment jsdom
import { tableSummary } from '@fphd/utils/observation-series';
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import type { IndicatorObservation, SelectedIndicator } from '../indicator/loader.ts';
import { observation, selected, sex } from '../indicator/view.testing.ts';
import { EMPTY_SEARCH_STATE } from '../search/url.ts';
import { topicTableSelection } from './data.ts';
import { TopicOverview } from './overview.tsx';

vi.mock('./geographies.tsx', () => ({ TopicGeographies: () => null }));

type Props = ComponentProps<typeof TopicOverview>;

function card(observations: IndicatorObservation[], detail: Partial<SelectedIndicator['detail']>) {
  const entry = selected();
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <TopicOverview
        topic={
          { slug: 'diabetes', title: 'Diabetes', description: 'About diabetes' } as Props['topic']
        }
        overview={{
          search: EMPTY_SEARCH_STATE as Props['overview']['search'],
          trends: {
            total: 1,
            better: 0,
            worse: 0,
            unchanged: 0,
            increasing: 0,
            decreasing: 0,
            unavailable: 1,
          },
          selected: topicTableSelection(
            [
              {
                ...entry,
                detail: { ...entry.detail, ...detail },
                ...tableSummary(
                  [{ areaCode: 'E92000001', areaName: 'England', observations }],
                  'sparkline',
                ),
              },
            ],
            5,
            8,
          ),
        }}
      />
    </MemoryRouter>,
  );
  return new DOMParser().parseFromString(html, 'text/html');
}

function summary(doc: Document) {
  return [...doc.querySelectorAll('.govuk-summary-list__row')].map((row) => [
    row.querySelector('dt')?.textContent,
    row.querySelector('dd')?.textContent,
  ]);
}

it('uses the rolling mortality series for the chart, latest figures and five-period trend', () => {
  const rolling = [92.3, 94, 95, 110, 122, 125.6, 118, 109.6].map((value, index) => ({
    ...observation(value),
    fromDate: `${2015 + index}-01-01`,
    toDate: `${2017 + index}-12-31`,
    count: null,
    numerator: 186_922,
  }));
  const annual = [140, 130, 120, 110, 105].map((value, index) => ({
    ...observation(value),
    fromDate: `${2020 + index}-01-01`,
    toDate: `${2020 + index}-12-31`,
    count: null,
    numerator: 60_825,
  }));
  const doc = card([...annual, ...rolling].reverse(), {
    unit: 'per 100,000',
    polarity: 'lower-is-better',
  });
  expect(summary(doc)).toEqual([
    ['Most recent period', '2022 to 2024'],
    ['Count', '186,922'],
    ['Calculated value', '109.6 per 100,000'],
    ['Trend (last 5 periods)', 'No significant change'],
  ]);
  expect(doc.querySelector('desc')?.textContent).toBe(
    'Indicator 108, England: rose from 92.3 per 100,000 in 2015 to 2017, peaked at 125.6 in 2020 to 2022, and has since decreased to 109.6 in 2022 to 2024',
  );
  expect(doc.querySelector('.fphd-sparkline__endpoints')?.textContent).toBe(
    '92.3per 100,000in 2015-17109.6per 100,000in 2022-24',
  );
});

it('labels the prevalence numerator as Count and expands summary and accessible financial years', () => {
  const doc = card(
    [6.8, 6.9, 7, 7.1, 7.2, 7.4, 7.6, 7.9].map((value, index) => ({
      ...observation(value),
      fromDate: `${2017 + index}-04-01`,
      toDate: `${2018 + index}-03-31`,
      count: null,
      numerator: 4_109_134,
    })),
    { polarity: 'no-polarity' },
  );
  expect(summary(doc)).toEqual([
    ['Most recent period', '2024 to 2025'],
    ['Count', '4,109,134'],
    ['Calculated value', '7.9%'],
    ['Trend (last 5 periods)', 'Increasing'],
  ]);
  expect(doc.querySelector('desc')?.textContent).toBe(
    'Indicator 108, England: rising from 6.8% in 2017 to 2018, to 7.9% in 2024 to 2025',
  );
  expect(doc.querySelector('.fphd-sparkline__endpoints')?.textContent).toBe(
    '6.8%in 2017/187.9%in 2024/25',
  );
});

it('uses the selected period trend when missing values push valid points beyond the chart history', () => {
  const rolling = [1, 2, 3, 4, 5, null, null, null, null, null, null, null, 6, 7, null].map(
    (value, index) => ({
      ...observation(),
      value,
      fromDate: `${2010 + index}-01-01`,
      toDate: `${2012 + index}-12-31`,
    }),
  );
  const annual = Array.from({ length: 15 }, (_, index) => ({
    ...observation(100 - index),
    fromDate: `${2010 + index}-01-01`,
    toDate: `${2010 + index}-12-31`,
  }));
  const doc = card([...rolling, ...annual], {});
  expect(summary(doc)[3]).toEqual(['Trend (last 5 periods)', 'Increasing and getting better']);
});

it('keeps the trend on the displayed period type for indicators with sex and period breakout rows', () => {
  const annual = [1, 2, 3, 4, 5].map((value, index) => ({
    ...observation(value, [sex('Female')]),
    fromDate: `${2020 + index}-01-01`,
    toDate: `${2020 + index}-12-31`,
  }));
  const rolling = annual.map((point, index) => ({
    ...point,
    value: 100 - index * 5,
    toDate: `${2022 + index}-12-31`,
  }));
  const doc = card([...annual, ...rolling], {});
  expect(summary(doc)[0]).toEqual(['Most recent period', '2024']);
  expect(summary(doc)[3]).toEqual(['Trend (last 5 periods)', 'Increasing and getting better']);
});

it.each([
  [1234, 5678, '1,234'],
  [0, 5678, '0'],
  [null, 5678, '5,678'],
  [null, null, 'No data'],
])(
  'shows Count for count %s and numerator %s without adding another measure row',
  (count, numerator, expected) => {
    const doc = card([{ ...observation(), count, numerator }], {});
    expect(summary(doc)).toHaveLength(4);
    expect(summary(doc)[1]).toEqual(['Count', expected]);
    expect(doc.querySelector('svg')).toBeNull();
    expect(doc.querySelector('.fphd-topic-highlight__no-trend')?.textContent).toContain(
      'No trend available',
    );
  },
);

it('keeps all four summary labels when there are no observations', () => {
  const doc = card([], {});
  expect(summary(doc)).toEqual([
    ['Most recent period', 'No data'],
    ['Count', 'No data'],
    ['Calculated value', 'No data'],
    ['Trend (last 5 periods)', 'Trend cannot be calculated(not enough data points)'],
  ]);
  expect(doc.querySelector('svg')).toBeNull();
});
