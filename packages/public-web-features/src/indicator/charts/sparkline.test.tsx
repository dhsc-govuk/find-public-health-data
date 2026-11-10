// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { IndicatorDetail } from '../loader.ts';
import { observation, selected } from '../view.testing.ts';
import { Sparkline } from './sparkline.tsx';

function markup(
  values: (number | null)[],
  detail: Partial<IndicatorDetail> = {},
  periods?: { fromDate: string; toDate: string }[],
) {
  const entry = selected();
  return renderToStaticMarkup(
    <Sparkline
      id="sparkline"
      title="Indicator trend"
      indicator={{ ...entry.detail, ...detail }}
      areas={[
        {
          areaCode: 'E92000001',
          areaName: 'England',
          observations: values.map((value, index) => ({
            ...observation(),
            value,
            fromDate: `${2020 + index}-01-01`,
            toDate: `${2020 + index}-12-31`,
            ...periods?.[index],
          })),
        },
      ]}
    />,
  );
}

it('renders the prototype geometry and endpoint narrative on the server without a disclosure', () => {
  const html = markup([10, 12, 14]);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const svg = doc.querySelector('svg');
  expect(svg?.getAttribute('role')).toBe('img');
  expect(svg?.querySelector('title')?.textContent).toBe('Indicator trend');
  expect(svg?.getAttribute('viewBox')).toBe('0 0 120 40');
  expect(svg?.getAttribute('height')).toBe('56');
  expect(svg?.hasAttribute('preserveAspectRatio')).toBe(false);
  expect(svg?.querySelector('desc')?.textContent).toBe(
    'Indicator 108, England: rising from 10.0% in 2020, to 14.0% in 2022',
  );
  expect(svg?.querySelector('polyline')?.getAttribute('points')).toBe(
    '4.0,36.0 60.0,20.0 116.0,4.0',
  );
  expect(svg?.querySelector('polyline')?.getAttribute('stroke')).toBe('#12436d');
  expect(svg?.querySelector('polyline')?.getAttribute('stroke-width')).toBe('2');
  expect(svg?.querySelector('circle')?.getAttribute('r')).toBe('3');
  expect(svg?.querySelector('circle')?.getAttribute('fill')).toBe('#12436d');
  expect(doc.querySelectorAll('details, table')).toHaveLength(0);
  expect(doc.querySelector('.fphd-sparkline__endpoints')?.getAttribute('aria-hidden')).toBe('true');
  expect(
    [...doc.querySelectorAll('.fphd-sparkline__endpoints > span')].map((el) => el.innerHTML),
  ).toEqual(['10.0%<br>in 2020', '14.0%<br>in 2022']);
});

it('keeps gaps and constant values finite and requires two values', () => {
  const doc = new DOMParser().parseFromString(markup([10, 10, null, 10, 10]), 'text/html');
  expect(doc.querySelectorAll('polyline')).toHaveLength(2);
  expect(doc.querySelector('desc')?.textContent).toBe(
    'Indicator 108, England: unchanged at 10.0% from 2020 to 2024. No data for 2022.',
  );
  expect(doc.querySelector('circle')?.getAttribute('cy')).toBe('20');
  expect(markup([null, 10])).toContain('No trend available (not enough data).');
  expect(markup([null, null])).toContain('No trend available (not enough data).');
});

it('limits the chart to the latest eight periods, including null gaps at its ends', () => {
  const doc = new DOMParser().parseFromString(
    markup([1, 2, null, 4, 5, 6, 7, 8, 9, null]),
    'text/html',
  );
  expect(doc.querySelector('polyline')?.getAttribute('points')).toBe(
    '20.0,36.0 36.0,29.6 52.0,23.2 68.0,16.8 84.0,10.4 100.0,4.0',
  );
  expect(doc.querySelector('circle')?.getAttribute('cx')).toBe('100');
  expect(doc.querySelector('desc')?.textContent).toBe(
    'Indicator 108, England: rising from 4.0% in 2023, to 9.0% in 2028. No data for 2022, 2029.',
  );
});

it('uses short financial years in the endpoints and description', () => {
  const periods = Array.from({ length: 8 }, (_, index) => ({
    fromDate: `${2017 + index}-04-01`,
    toDate: `${2018 + index}-03-31`,
  }));
  const doc = new DOMParser().parseFromString(
    markup([6.8, 6.9, 7, 7.1, 7.2, 7.4, 7.6, 7.9], {}, periods),
    'text/html',
  );
  expect(doc.querySelector('desc')?.textContent).toBe(
    'Indicator 108, England: rising from 6.8% in 2017/18, to 7.9% in 2024/25',
  );
  expect(
    [...doc.querySelectorAll('.fphd-sparkline__endpoints > span')].map((el) => el.innerHTML),
  ).toEqual(['6.8%<br>in 2017/18', '7.9%<br>in 2024/25']);
});

it('follows the prototype peak description with short ranges and the unit on its own caption line', () => {
  const periods = Array.from({ length: 8 }, (_, index) => ({
    fromDate: `${2015 + index}-01-01`,
    toDate: `${2017 + index}-12-31`,
  }));
  const doc = new DOMParser().parseFromString(
    markup([92.3, 94, 95, 110, 122, 125.6, 118, 109.6], { unit: 'per 100,000' }, periods),
    'text/html',
  );
  expect(doc.querySelector('desc')?.textContent).toBe(
    'Indicator 108, England: rose from 92.3 per 100,000 in 2015-17, peaked at 125.6 in 2020-22, and has since decreased to 109.6 in 2022-24',
  );
  expect(
    [...doc.querySelectorAll('.fphd-sparkline__endpoints > span')].map((el) => el.innerHTML),
  ).toEqual(['92.3<br>per 100,000<br>in 2015-17', '109.6<br>per 100,000<br>in 2022-24']);
});

it.each([
  [[3, 2, 1], 'falling from 3.0 in 2020, to 1.0 in 2022'],
  [
    [3, 1, 2],
    'fell from 3.0 in 2020, reached a low of 1.0 in 2021, and has since increased to 2.0 in 2022',
  ],
])('describes falling values and a low point without a unit', (values, description) => {
  const doc = new DOMParser().parseFromString(
    markup(values as number[], { unit: null }),
    'text/html',
  );
  expect(doc.querySelector('desc')?.textContent).toBe(`Indicator 108, England: ${description}`);
});
