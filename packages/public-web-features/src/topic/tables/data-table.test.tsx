// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { recentTrend } from '../../indicator/data.ts';
import type { TopicColumn } from '../data.ts';
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
      <TopicDataTable
        model={model}
        title="Diabetes"
        columns={['period', 'updated', 'trend', 'value', 'summary']}
      />
    </MemoryRouter>,
  );

  expect(
    screen.getByRole('table', {
      name: /^Diabetes indicators: North East compared with England, table with/,
    }),
  ).toBeTruthy();
  expect(headers()).toEqual([
    'North East',
    'England',
    'Indicator',
    'Most recentperiod',
    'Data lastupdated',
    'Trend(last 5 periods)',
    'Calculatedvalue',
    'Comparisonsummary',
    'Calculatedvalue',
  ]);
  const smoking = screen.getByRole('row', { name: /Smoking/ });
  expect(smoking.textContent).toMatch(/18\.0%Better than England28\.0%$/);
  const obesity = screen.getByRole('row', { name: /Obesity/ });
  expect(obesity.textContent).toMatch(/-No data-No data31\.0%$/);
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

  expect(
    screen.getByRole('table', { name: /^Diabetes indicators for England, table with/ }),
  ).toBeTruthy();
  expect(headers()).toEqual([
    'England',
    'Indicator',
    'Most recentperiod',
    'Data lastupdated',
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
  expect(screen.getByRole('cell', { name: '18.0%(2022)' })).toBeTruthy();

  rerender(
    <MemoryRouter>
      <TopicDataTable model={model} title="Diabetes" columns={['period', 'trend', 'summary']} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('cell', { name: 'Better than England(2022)' })).toBeTruthy();
});

it('shows no comparison available when the same-period England value is missing', () => {
  const model: TopicDataTableModel = {
    kind: 'data',
    compared: true,
    areas: [{ code: 'E12000001', name: 'North East' }],
    rows: [
      row('Smoking', { value: 18, judgement: null }, { value: null, count: null, numerator: null }),
    ],
  };
  render(
    <MemoryRouter>
      <TopicDataTable model={model} title="Diabetes" />
    </MemoryRouter>,
  );
  expect(screen.getByRole('cell', { name: 'No comparison available' })).toBeTruthy();
  expect(screen.queryByText('Neither better nor worse')).toBeNull();
});

it.each<{ columns: TopicColumn[] }>([
  { columns: [] },
  { columns: ['trend'] },
  { columns: ['count'] },
  { columns: ['numerator'] },
])('keeps England calculated value when the selected columns are $columns', ({ columns }) => {
  const model: TopicDataTableModel = {
    kind: 'data',
    compared: true,
    areas: [{ code: 'E12000001', name: 'North East' }],
    rows: [
      row('Smoking', { value: 18, judgement: 'better' }, { value: 28, count: 280, numerator: 140 }),
    ],
  };
  render(
    <MemoryRouter>
      <TopicDataTable model={model} title="Diabetes" columns={columns} />
    </MemoryRouter>,
  );
  expect(headers()).toContain('England');
  expect(headers().at(-1)).toBe('Calculatedvalue');
  expect(screen.getByRole('cell', { name: '28.0%2023' })).toBeTruthy();
});

it('labels lagging counts and numerators and identifies the England benchmark used', () => {
  const lagging = row(
    'Smoking',
    { value: 26, judgement: 'better' },
    { value: 28, count: null, numerator: null },
  );
  const cell = lagging.cells[0];
  if (!cell) throw new Error('Cell fixture missing');
  lagging.cells = [
    {
      ...cell,
      count: 260,
      numerator: 130,
      period: '2022',
      benchmark: { value: 30, period: '2022' },
    },
  ];
  const model: TopicDataTableModel = {
    kind: 'data',
    compared: true,
    areas: [{ code: 'E12000001', name: 'North East' }],
    rows: [lagging],
  };
  const { rerender } = render(
    <MemoryRouter>
      <TopicDataTable model={model} title="Diabetes" columns={['count', 'numerator', 'summary']} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('cell', { name: '260(2022)' })).toBeTruthy();
  expect(screen.getByRole('cell', { name: '130(2022)' })).toBeTruthy();
  expect(
    screen.getByRole('cell', { name: /Better than England \(England: 30.0%, 2022\)/ }),
  ).toBeTruthy();
  expect(screen.getByRole('cell', { name: '28.0%2023' })).toBeTruthy();
  rerender(
    <MemoryRouter>
      <TopicDataTable
        model={model}
        title="Diabetes"
        columns={['count', 'numerator', 'value', 'summary']}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole('cell', { name: '260(2022)' })).toBeTruthy();
  expect(screen.getByRole('cell', { name: '130(2022)' })).toBeTruthy();
  expect(screen.getByRole('cell', { name: '26.0%(2022)' })).toBeTruthy();
});

it('renders an empty area comparison once when calculated value is hidden', () => {
  const empty = row(
    'Smoking',
    { value: null, judgement: null },
    { value: null, count: null, numerator: null },
  );
  empty.period = '';
  const model: TopicDataTableModel = {
    kind: 'data',
    compared: true,
    areas: [{ code: 'E12000001', name: 'North East' }],
    rows: [empty],
  };
  render(
    <MemoryRouter>
      <TopicDataTable model={model} title="Diabetes" columns={['summary']} />
    </MemoryRouter>,
  );
  const cells = within(screen.getByRole('row', { name: /Smoking/ })).getAllByRole('cell');
  expect(cells).toHaveLength(2);
  expect(cells[1]?.textContent).toBe('-No data');
});

const compared = (rows: TopicDataTableModel['rows'], names = ['North East']) =>
  ({
    kind: 'data',
    compared: true,
    areas: names.map((name, index) => ({ code: `E1200000${index + 1}`, name })),
    rows,
  }) satisfies TopicDataTableModel;

const spread = () => {
  const smoking = row(
    'Smoking',
    { value: 18, judgement: 'better' },
    { value: 28, count: null, numerator: null, min: 5, p25: 12, p75: 30, max: 45 },
  );
  const cell = smoking.cells[0];
  if (!cell) throw new Error('Cell fixture missing');
  smoking.cells = [{ ...cell, range: { min: 5, p25: 12, p75: 30, max: 45 } }];
  return smoking;
};

it('puts England’s spread before its value and the chart beside each area', () => {
  render(
    <MemoryRouter>
      <TopicDataTable
        model={compared([spread()])}
        title="Diabetes"
        columns={['value', 'chart', 'summary', 'minmax', 'percentiles']}
      />
    </MemoryRouter>,
  );
  expect(headers()).toEqual([
    'North East',
    'England',
    'Indicator',
    'Calculatedvalue',
    'Comparedwith England',
    'Comparisonsummary',
    'England lowest',
    'England 25th percentile',
    'England 75th percentile',
    'England highest',
    'Calculatedvalue',
  ]);
  const cells = within(screen.getByRole('row', { name: /Smoking/ })).getAllByRole('cell');
  expect(cells.map((cell) => cell.textContent)).toEqual([
    '18.0%',
    'Smoking. Period: 2023. Value: 18.0%. Area: North East. Comparison: Better than England. Value: 28.0%. Area: England. Lowest to highest: 5.0% to 45.0%. 25th to 75th percentile: 12.0% to 30.0%',
    'Better than England',
    '5.0%',
    '12.0%',
    '30.0%',
    '45.0%',
    '28.0%2023',
  ]);
  expect(screen.getByRole('columnheader', { name: 'England' }).getAttribute('colspan')).toBe('5');
});

it('shows the area-level spread without a same-period England value or comparison', () => {
  const smoking = spread();
  if (!smoking.england || !smoking.cells[0]) throw new Error('Comparison fixture missing');
  smoking.england.value = null;
  smoking.cells[0].judgement = null;
  render(
    <MemoryRouter>
      <TopicDataTable
        model={compared([smoking])}
        title="Diabetes"
        columns={['value', 'chart', 'summary', 'minmax', 'percentiles']}
      />
    </MemoryRouter>,
  );
  const cells = within(screen.getByRole('row', { name: /Smoking/ })).getAllByRole('cell');
  expect(cells.map((cell) => cell.textContent)).toEqual([
    '18.0%',
    '-No data',
    'No comparison available',
    '5.0%',
    '12.0%',
    '30.0%',
    '45.0%',
    '-No data',
  ]);
});

it('turns the minimum/maximum and percentile columns on independently', () => {
  render(
    <MemoryRouter>
      <TopicDataTable model={compared([spread()])} title="Diabetes" columns={['percentiles']} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('columnheader', { name: 'England 25th percentile' })).toBeTruthy();
  expect(screen.queryByRole('columnheader', { name: 'England lowest' })).toBeNull();
});

it.each([
  ['a matching England value', undefined, undefined, 28],
  ['an older matching England value', '2022', { value: 30, period: '2022' }, 30],
  ['no England value for the older period', '2022', undefined, null],
])('charts the area with %s', (_, period, benchmark, expected) => {
  const smoking = spread();
  smoking.cells = smoking.cells.map((cell) => ({
    ...cell,
    ...(period ? { period } : {}),
    ...(benchmark ? { benchmark } : {}),
    judgement: expected == null ? null : cell.judgement,
  }));
  render(
    <MemoryRouter>
      <TopicDataTable model={compared([smoking])} title="Diabetes" columns={['chart', 'summary']} />
    </MemoryRouter>,
  );
  const cells = within(screen.getByRole('row', { name: /Smoking/ })).getAllByRole('cell');
  if (expected == null) {
    expect(cells[0]?.textContent).toBe('-No data');
    expect(cells[1]?.textContent).toBe('No comparison available(2022)');
  } else {
    expect(cells[0]?.textContent).toContain(`Value: ${expected}.0%. Area: England`);
  }
});

it('associates each value with its row, area and column headings', () => {
  render(
    <MemoryRouter>
      <TopicDataTable model={compared([spread()])} title="Diabetes" columns={['period', 'value']} />
    </MemoryRouter>,
  );
  const named = (id: string) => document.getElementById(id)?.textContent?.replace(/\s+/g, ' ');
  const cells = within(screen.getByRole('row', { name: /Smoking/ })).getAllByRole('cell');
  expect((cells[0]?.getAttribute('headers') ?? '').split(' ').map(named)).toEqual([
    'Smoking',
    'Most recentperiod',
  ]);
  expect((cells[1]?.getAttribute('headers') ?? '').split(' ').map(named)).toEqual([
    'Smoking',
    'North East',
    'Calculatedvalue',
  ]);
});

it('captions the chosen areas and the table’s size, keeping the identifying columns frozen', () => {
  render(
    <MemoryRouter>
      <TopicDataTable
        model={compared([spread()], ['North East', 'Kent', 'Devon'])}
        title="Diabetes"
        columns={['period', 'value']}
      />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('table', {
      name: 'Diabetes indicators: North East, Kent and Devon compared with England, table with 1 row and 6 columns',
    }),
  ).toBeTruthy();
  expect(screen.getByRole('rowheader', { name: /Smoking/ }).className).toContain(
    'fphd-table__frozen',
  );
  expect(screen.getByRole('cell', { name: '2023' }).className).toContain(
    'fphd-table__frozen--second',
  );
});

it('sizes the columns as the prototype does, the indicator a third of the rest', () => {
  render(
    <MemoryRouter>
      <TopicDataTable
        model={compared([spread()])}
        title="Diabetes"
        columns={['period', 'updated', 'trend', 'value', 'chart', 'summary']}
      />
    </MemoryRouter>,
  );
  expect(
    [...document.querySelectorAll('col')].map((column) => column.getAttribute('width')),
  ).toEqual(['331', '100', '90', '150', '150', '243', '110', '150']);
});

it('shows a dash, read as No data, for a missing value or chart', () => {
  render(
    <MemoryRouter>
      <TopicDataTable
        model={compared([row('Smoking', { value: null, judgement: null }, null)])}
        title="Diabetes"
        columns={['value', 'chart']}
      />
    </MemoryRouter>,
  );
  const cells = within(screen.getByRole('row', { name: /Smoking/ })).getAllByRole('cell');
  expect(cells.slice(0, 2).map((cell) => cell.textContent)).toEqual(['-No data', '-No data']);
});

it.each([undefined, 'No data', '2022'])(
  'does not chart an area without data regardless of its period label (%s)',
  (period) => {
    const smoking = spread();
    smoking.cells = smoking.cells.map((cell) => ({
      ...cell,
      value: null,
      ...(period !== undefined ? { period } : {}),
    }));
    render(
      <MemoryRouter>
        <TopicDataTable model={compared([smoking])} title="Diabetes" columns={['chart']} />
      </MemoryRouter>,
    );
    const cells = within(screen.getByRole('row', { name: /Smoking/ })).getAllByRole('cell');
    expect(cells[0]?.textContent).toBe('-No data');
    expect(within(cells[0] as HTMLElement).queryByRole('img')).toBeNull();
  },
);

it.each([false, true])(
  'keeps finite widths with all columns deselected (compared: %s)',
  (compare) => {
    const model: TopicDataTableModel = compare
      ? compared([spread()])
      : {
          kind: 'data',
          compared: false,
          areas: [{ code: 'E92000001', name: 'England' }],
          rows: [row('Smoking', { value: 28, judgement: null }, null)],
        };
    render(
      <MemoryRouter>
        <TopicDataTable model={model} title="Diabetes" columns={[]} />
      </MemoryRouter>,
    );
    expect(
      [...document.querySelectorAll('col')].map((column) => column.getAttribute('width')),
    ).toEqual(compare ? ['50', '150'] : ['680']);
  },
);

it('places one comparison key before the topic table only when the chart column is shown', () => {
  const model: TopicDataTableModel = {
    kind: 'data',
    compared: true,
    areas: [{ code: 'E12000001', name: 'North East' }],
    rows: [
      row(
        'Smoking',
        { value: 18, judgement: 'better' },
        { value: 28, count: null, numerator: null },
      ),
    ],
  };
  const { container, rerender } = render(
    <MemoryRouter>
      <TopicDataTable model={model} title="Health" columns={['value', 'chart']} />
    </MemoryRouter>,
  );
  expect(screen.getAllByText('Key to the comparison chart')).toHaveLength(1);
  const key = container.querySelector('details');
  expect(key?.compareDocumentPosition(screen.getByRole('table'))).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  rerender(
    <MemoryRouter>
      <TopicDataTable model={model} title="Health" columns={['value']} />
    </MemoryRouter>,
  );
  expect(screen.queryByText('Key to the comparison chart')).toBeNull();
});
