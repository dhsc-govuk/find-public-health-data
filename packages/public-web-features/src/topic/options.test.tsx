// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { TOPIC_COLUMNS, topicColumns } from './data.ts';
import { TopicTableColumns } from './options.tsx';

afterEach(cleanup);

function show(query = '') {
  const router = createMemoryRouter([{ path: '/topics/example', Component: TopicTableColumns }], {
    initialEntries: [`/topics/example?tab-topic=data&${query}`],
  });
  const { container } = render(<RouterProvider router={router} />);
  fireEvent.click(screen.getByRole('button', { name: 'Table columns' }));
  const form = container.querySelector('form');
  if (!form) throw new Error('Expected a column form');
  return { router, form };
}

it.each(['', 'ga=E92000001'])(
  'offers only England columns and preserves checked comparisons for %s',
  (query) => {
    const { form } = show(query);
    expect(screen.getAllByRole('checkbox').map((input) => input.getAttribute('value'))).toEqual([
      'period',
      'updated',
      'trend',
      'count',
      'numerator',
      'value',
    ]);
    expect(new FormData(form).getAll('columns-topic')).toEqual([
      'none',
      'chart',
      'summary',
      'period',
      'updated',
      'trend',
      'value',
    ]);
  },
);

it('preserves every selected hidden comparison option on a JavaScript-free form submission', () => {
  const { form } = show('columns-topic=chart,summary,minmax,percentiles');
  const params = new URLSearchParams();
  for (const [name, value] of new FormData(form)) params.append(name, String(value));
  expect(topicColumns(params)).toEqual(['chart', 'summary', 'minmax', 'percentiles']);
  expect(form.querySelectorAll('input[type="hidden"][name="columns-topic"]').length).toBe(5);
});

it.each(['columns-topic=', 'columns-topic=none'])(
  'preserves no selected columns for %s',
  (query) => {
    const { form } = show(query);
    expect(new FormData(form).getAll('columns-topic')).toEqual(['none']);
  },
);

it('offers every column with independent default selections when an area is chosen', () => {
  const { form } = show('ga=E12000001');
  expect(screen.getAllByRole('checkbox').map((input) => input.getAttribute('value'))).toEqual(
    TOPIC_COLUMNS.map(({ value }) => value),
  );
  expect(new FormData(form).getAll('columns-topic')).toEqual([
    'none',
    'period',
    'updated',
    'trend',
    'value',
    'chart',
    'summary',
  ]);
  expect(screen.getByRole('checkbox', { name: 'Data last updated' })).toBeTruthy();
});

it('toggles chart, summary, minimum/maximum and percentiles independently', async () => {
  const { router } = show('ga=E12000001&q=health');
  for (const [label, expected] of [
    ['Compared with England', ['period', 'updated', 'trend', 'value', 'summary']],
    ['Minimum/Maximum values', ['period', 'updated', 'trend', 'value', 'summary', 'minmax']],
    ['Comparison summary', ['period', 'updated', 'trend', 'value', 'minmax']],
    ['25th/75th percentiles', ['period', 'updated', 'trend', 'value', 'minmax', 'percentiles']],
  ] as const) {
    fireEvent.click(screen.getByRole('checkbox', { name: label }));
    await waitFor(() =>
      expect(topicColumns(new URLSearchParams(router.state.location.search))).toEqual(expected),
    );
  }
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get('ga')).toBe('E12000001');
  expect(params.get('q')).toBe('health');
  expect(params.get('tab-topic')).toBe('data');
});
