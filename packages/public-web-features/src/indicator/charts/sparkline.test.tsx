// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { observation, selected } from '../view.testing.ts';
import { Sparkline } from './sparkline.tsx';

function markup(values: (number | null)[]) {
  const entry = selected();
  return renderToStaticMarkup(
    <Sparkline
      id="sparkline"
      title="Indicator trend"
      indicator={entry.detail}
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
}

it('renders the trend on the server with its values as a description and a table', () => {
  const html = markup([10, 12, 14]);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const svg = doc.querySelector('svg');
  expect(svg?.getAttribute('role')).toBe('img');
  expect(svg?.querySelector('title')?.textContent).toBe('Indicator trend');
  expect(svg?.querySelector('desc')?.textContent).toBe('2020: 10.0%; 2021: 12.0%; 2022: 14.0%');
  expect(svg?.querySelector('polyline')?.getAttribute('points')).toBe(
    '5.0,51.0 140.0,28.0 275.0,5.0',
  );
  expect(doc.querySelector('summary')?.textContent).toBe('View chart data as a table');
  expect([...doc.querySelectorAll('tbody tr')].map((row) => row.textContent)).toEqual([
    '202010.0%',
    '202112.0%',
    '202214.0%',
  ]);
});

it('keeps gaps and constant values finite and requires two values', () => {
  const doc = new DOMParser().parseFromString(markup([10, 10, null, 10, 10]), 'text/html');
  expect(doc.querySelectorAll('polyline')).toHaveLength(2);
  expect(doc.querySelector('desc')?.textContent).toContain('2022: No data');
  expect(doc.querySelector('circle')?.getAttribute('cy')).toBe('28');
  expect(markup([null, 10])).toContain('No trend available (not enough data).');
});
