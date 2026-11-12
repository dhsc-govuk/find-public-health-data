// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { recentTrend } from '../../indicator/data.ts';
import type { TopicDataTableModel } from '../table-models.ts';
import { TopicDataTable } from './data-table.tsx';

afterEach(cleanup);

const row = (
  name: string,
  area: { value: number | null; judgement: 'better' | 'none' | null },
  england: TopicDataTableModel['rows'][number]['england'],
): TopicDataTableModel['rows'][number] => ({
  key: name,
  name,
  slug: name.toLowerCase(),
  suffix: '',
  period: '2023',
  unit: '%',
  updatedAt: '2024-04-01T00:00:00Z',
  subtopics: [],
  england,
  cells: [
    {
      areaCode: england ? 'E12000001' : 'E92000001',
      value: area.value,
      count: null,
      numerator: null,
      trend: recentTrend([], null),
      judgement: area.judgement,
    },
  ],
});

const headers = () =>
  screen.getAllByRole('columnheader').map((header) => header.textContent?.replace(/\s+/g, ' '));

it('follows a picked area with its comparison summary and puts England last', () => {
  const model: TopicDataTableModel = {
    kind: 'data',
    compared: true,
    areas: [{ code: 'E12000001', name: 'North East' }],
    rows: [
      row('Smoking', { value: 18, judgement: 'better' }, { value: 28, count: 280, numerator: 140 }),
      row(
        'Obesity',
        { value: null, judgement: 'none' },
        { value: 31, count: null, numerator: null },
      ),
      row(
        'Care home deaths',
        { value: 29, judgement: 'none' },
        { value: 41, count: null, numerator: null },
      ),
    ],
  };
  render(
    <MemoryRouter>
      <TopicDataTable model={model} title="Diabetes" />
    </MemoryRouter>,
  );

  expect(
    screen.getByRole('table', { name: 'Diabetes indicators: North East compared with England' }),
  ).toBeTruthy();
  expect(headers()).toEqual([
    'Indicator',
    'Most recentperiod',
    'Lastupdated',
    'North East',
    'England',
    'Trend(last 5 periods)',
    'Calculatedvalue',
    'Comparisonsummary',
    'Calculatedvalue',
  ]);
  const smoking = screen.getByRole('row', { name: /Smoking/ });
  expect(smoking.textContent).toMatch(/18\.0%Better than England28\.0%$/);
  const obesity = screen.getByRole('row', { name: /Obesity/ });
  expect(obesity.textContent).toMatch(/No dataNo data31\.0%$/);
  const careHome = screen.getByRole('row', { name: /Care home deaths/ });
  expect(careHome.textContent).toMatch(/29\.0%Neither better nor worse41\.0%$/);
});

it('shows England alone, with its trend, when no area is picked', () => {
  const model: TopicDataTableModel = {
    kind: 'data',
    compared: false,
    areas: [{ code: 'E92000001', name: 'England' }],
    rows: [row('Smoking', { value: 28, judgement: null }, null)],
  };
  render(
    <MemoryRouter>
      <TopicDataTable model={model} title="Diabetes" />
    </MemoryRouter>,
  );

  expect(screen.getByRole('table', { name: 'Diabetes indicators for England' })).toBeTruthy();
  expect(headers()).toEqual([
    'Indicator',
    'Most recentperiod',
    'Lastupdated',
    'England',
    'Trend(last 5 periods)',
    'Calculatedvalue',
  ]);
});

it('shows the period of an area value that lags the row', () => {
  const lagging = row(
    'Smoking',
    { value: 18, judgement: 'better' },
    { value: 28, count: null, numerator: null },
  );
  const cell = lagging.cells[0];
  if (!cell) throw new Error('Cell fixture missing');
  lagging.cells = [{ ...cell, period: '2022' }];
  const model: TopicDataTableModel = {
    kind: 'data',
    compared: true,
    areas: [{ code: 'E12000001', name: 'North East' }],
    rows: [lagging],
  };
  const { rerender } = render(
    <MemoryRouter>
      <TopicDataTable model={model} title="Diabetes" />
    </MemoryRouter>,
  );
  expect(screen.getByRole('cell', { name: '18.0%2022' })).toBeTruthy();

  rerender(
    <MemoryRouter>
      <TopicDataTable model={model} title="Diabetes" columns={['period', 'trend']} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('cell', { name: 'Better than England2022' })).toBeTruthy();
});
