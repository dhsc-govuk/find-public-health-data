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

it('puts highlighted areas above England, names the chart column, and drops empty CI columns', () => {
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
    { ...row, areaCode: 'E92000001', areaName: 'England', lowerCi95: null, upperCi95: null },
    { ...row, areaCode: 'a', areaName: 'Alpha', value: 8, lowerCi95: null, upperCi95: null },
    { ...row, areaCode: 'b', areaName: 'Beta', value: 12, lowerCi95: null, upperCi95: null },
    { ...row, areaCode: 'n', areaName: 'Nowhere', value: null, lowerCi95: null, upperCi95: null },
  ];
  render(
    <AreaComparisonTable
      indicator={primary}
      model={model}
      sort="descending"
      highlighted={['a']}
      colour="quintiles"
    />,
  );
  const table = within(screen.getByRole('table'));
  expect(table.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual([
    'Alpha (highlighted)',
    'England (benchmark)',
    'Beta',
    'Nowhere',
  ]);
  expect(table.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
    'Area',
    `Value (${primary.detail.unit ?? 'number'})`,
    'Quintile',
    'Comparison chart',
  ]);
  const nowhere = table.getByRole('rowheader', { name: 'Nowhere' }).closest('tr');
  expect(nowhere?.textContent).toContain('No data');
});

it('keeps CI columns when only the filtered-out areas have confidence intervals', () => {
  const primary = selected();
  const model = indicatorComparisonModel([primary], {
    compareAreasData: primary.areaData,
    comparedAreasData: [],
    compareAreaOptions: [],
    compareAreaGroup: 'Local authorities',
    comparisonDisplayGroups: [],
  }).areas;
  const row = model.rows[0];
  if (!row) throw new Error('Missing row fixture');
  model.rows = [
    { ...row, areaCode: 'a', areaName: 'Alpha', lowerCi95: null, upperCi95: null },
    { ...row, areaCode: 'b', areaName: 'Beta', lowerCi95: 1, upperCi95: 2 },
  ];
  render(
    <AreaComparisonTable
      indicator={primary}
      model={model}
      sort="descending"
      highlighted={[]}
      only={new Set(['a'])}
    />,
  );
  expect(screen.queryByRole('rowheader', { name: 'Beta' })).toBeNull();
  expect(screen.getByRole('columnheader', { name: '95% lower confidence interval' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: '95% upper confidence interval' })).toBeTruthy();
});
