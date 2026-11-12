// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChartDataTable } from './chart-elements.tsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('keeps repeated column names distinct when chart values change', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const table = (values: number[]) => (
    <ChartDataTable
      title="Indicators with the same name"
      columns={['Area', 'Prevalence (%)', 'Prevalence (%)']}
      rows={[{ key: 'cornwall', label: 'Cornwall', values }]}
    />
  );
  const { rerender } = render(table([10, 20]));
  rerender(table([30, 40]));
  const row = screen.getByRole('row', { name: 'Cornwall 30 40', hidden: true });
  expect(
    within(row)
      .getAllByRole('cell', { hidden: true })
      .map((cell) => cell.textContent),
  ).toEqual(['30', '40']);
  expect(
    errors.mock.calls.filter((args) => args.some((arg) => String(arg).includes('same key'))),
  ).toEqual([]);
});
