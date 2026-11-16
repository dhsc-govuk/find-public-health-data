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

it('keeps unchecked comparison columns off after removing and re-adding the chosen area', async () => {
  const { router } = show('ga=E12000001');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Compared with England' }));
  await waitFor(() =>
    expect(topicColumns(new URLSearchParams(router.state.location.search))).not.toContain('chart'),
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Comparison summary' }));
  await waitFor(() =>
    expect(topicColumns(new URLSearchParams(router.state.location.search))).not.toContain(
      'summary',
    ),
  );
  const params = new URLSearchParams(router.state.location.search);
  params.delete('ga');
  await router.navigate({ search: `?${params}` });
  await waitFor(() =>
    expect(screen.queryByRole('checkbox', { name: 'Compared with England' })).toBeNull(),
  );
  const form = document.querySelector('form');
  if (!form) throw new Error('Column form missing');
  const submitted = new URLSearchParams();
  for (const [name, value] of new FormData(form)) submitted.append(name, String(value));
  expect(submitted.getAll('columns-topic')).toEqual([
    'none',
    'period',
    'updated',
    'trend',
    'value',
  ]);
  submitted.set('ga', 'E12000001');
  await router.navigate({ search: `?${submitted}` });
  await waitFor(() => {
    for (const name of ['Compared with England', 'Comparison summary']) {
      expect((screen.getByRole('checkbox', { name }) as HTMLInputElement).checked).toBe(false);
    }
  });
});
