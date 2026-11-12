// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { indicatorComparisonModel } from '../comparison-model.ts';
import { selected } from '../view.testing.ts';
import { AreaComparisonTable } from './area-comparison-table.tsx';

afterEach(cleanup);

it('sorts a copy without ES2023 array methods and keeps England first and missing values last', () => {
  const primary = selected();
  const model = indicatorComparisonModel([primary], {
    compareAreasData: primary.areaData,
    comparedAreasData: [],
    compareAreaOptions: [],
    compareAreaGroup: 'Local authorities',
    comparisonDisplayGroups: [],
  }).areas;
  const row = model.rows[0];
  if (!row) throw new Error('Expected a benchmark fixture');
  model.rows = [
    { ...row, areaCode: 'b', areaName: 'Beta', value: 12 },
    { ...row, areaCode: 'missing', areaName: 'Unknown', value: null },
    { ...row, areaCode: 'a', areaName: 'Alpha', value: 8 },
    { ...row, areaCode: 'E92000001', areaName: 'England' },
  ];
  Object.defineProperty(model.rows, 'toSorted', { value: undefined });
  Object.freeze(model.rows);
  const table = (sort: string) => (
    <AreaComparisonTable indicator={primary} model={model} sort={sort} highlighted={[]} />
  );
  const { rerender } = render(table('ascending'));
  const headers = () =>
    within(screen.getByRole('table'))
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent);
  expect(headers()).toEqual(['England (benchmark)', 'Alpha', 'Beta', 'Unknown']);
  rerender(table('descending'));
  expect(headers()).toEqual(['England (benchmark)', 'Beta', 'Alpha', 'Unknown']);
  rerender(table('alphabetical'));
  expect(headers()).toEqual(['England (benchmark)', 'Alpha', 'Beta', 'Unknown']);
  expect(model.rows.map(({ areaCode }) => areaCode)).toEqual(['b', 'missing', 'a', 'E92000001']);
});
