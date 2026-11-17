// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { benchmarkFixture } from '../benchmark.testing.ts';
import { trendCsv } from '../download.ts';
import type { IndicatorAreaData, IndicatorDetail } from '../loader.ts';
import { type TrendColumns, trendTableModel } from '../trend.ts';
import { TrendTable } from './trend-table.tsx';

afterEach(cleanup);

function indicator(unit: string | null) {
  return {
    name: 'Resident population',
    unit,
    yearType: { value: 'calendar', label: 'Calendar' },
    polarity: 'no-comparison-possible',
    comparatorMethod: null,
  } as IndicatorDetail;
}

const areaData = [
  {
    areaCode: 'E92000001',
    areaName: 'England',
    observations: [
      {
        fromDate: '2023-01-01',
        toDate: '2023-12-31',
        value: 12.3,
        lowerCi95: null,
        upperCi95: null,
        lowerCi998: null,
        upperCi998: null,
        count: null,
        numerator: null,
        denominator: null,
        notes: [],
        dimensions: [],
      },
    ],
  },
];

describe('TrendTable', () => {
  it('orders all benchmark groups and per-area comparison columns for two areas, including plain goal verdicts', () => {
    const fixture = benchmarkFixture();
    const columns: TrendColumns = {
      count: false,
      numerator: false,
      value: true,
      confidence: [],
      minMax: true,
      percentiles: true,
      chart: true,
      goal: true,
    };
    const { container } = render(
      <TrendTable {...fixture} indicator={fixture.detail} confidence="95" columns={columns} />,
    );
    const groups = [...container.querySelectorAll('thead tr:first-child th')];
    expect(groups.map((group) => group.textContent)).toEqual([
      'Manchester',
      'Cornwall',
      'England',
      'North West (Statistical region)',
      'South West (Statistical region)',
      'Decile 1 (IMD 2019)',
      'Decile 2 (IMD 2019)',
      'Decile 1 (IMD 2025)',
      'Decile 2 (IMD 2025)',
      'Statistical neighbours (Manchester)',
      'Statistical neighbours (Cornwall)',
      'Combined authority (Manchester)',
      'Combined authority (Cornwall)',
      'Policy goal',
    ]);
    expect(
      [...container.querySelectorAll('thead tr:nth-child(2) th')]
        .map((heading) => heading.textContent)
        .filter((text) => text?.startsWith('Compared with')),
    ).toEqual([
      'Compared with England',
      'Compared with North West',
      'Compared with similarly deprived areas (IMD 2019)',
      'Compared with similarly deprived areas (IMD 2025)',
      'Compared with policy goal',
      'Compared with England',
      'Compared with South West',
      'Compared with similarly deprived areas (IMD 2019)',
      'Compared with similarly deprived areas (IMD 2025)',
      'Compared with policy goal',
    ]);
    const cells = [...container.querySelectorAll('tbody tr:first-child td')];
    expect(cells[5]?.textContent).toBe('Good');
    expect(cells[11]?.textContent).toBe('Bad');
    expect(cells[5]?.children.length).toBe(0);
    expect(cells.at(-2)?.textContent).toBe('-');
    expect(screen.getByRole('columnheader', { name: '<4% is good, >6% is bad' })).toBeTruthy();
    expect(groups.slice(-5, -1).map((group) => group.getAttribute('colspan'))).toEqual([
      '1',
      '1',
      '1',
      '1',
    ]);
    for (const cell of cells) {
      for (const header of (cell.getAttribute('headers') ?? '').split(' '))
        expect(container.querySelector(`[id="${header}"]`)).toBeTruthy();
    }
  });

  it('compares England with the goal without picked areas and can hide its verdict column', () => {
    const fixture = benchmarkFixture();
    const areaData = fixture.areaData.filter(({ areaCode }) => areaCode === 'E92000001');
    const { rerender } = render(
      <TrendTable
        areaData={areaData}
        benchmarks={['goal']}
        indicator={fixture.detail}
        confidence="none"
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'England' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Neither good nor bad' })).toBeTruthy();
    const columns: TrendColumns = {
      count: false,
      numerator: false,
      value: true,
      confidence: [],
      minMax: false,
      percentiles: false,
      chart: false,
      goal: false,
    };
    rerender(
      <TrendTable
        areaData={areaData}
        benchmarks={['goal']}
        indicator={fixture.detail}
        confidence="none"
        columns={columns}
      />,
    );
    expect(screen.queryByRole('columnheader', { name: 'Compared with policy goal' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Policy goal' })).toBeTruthy();
  });
  it('keeps count, numerator, value and both interval column choices consistent with the CSV', () => {
    const columns: TrendColumns = {
      count: true,
      numerator: true,
      value: false,
      confidence: ['95', '99.8'],
      minMax: false,
      percentiles: false,
      chart: false,
    };
    const data = areaData.map((area) => ({
      ...area,
      observations: area.observations.map((row) => ({
        ...row,
        count: 1024,
        numerator: 512,
        lowerCi95: 11,
        upperCi95: 13,
        lowerCi998: 10,
        upperCi998: 14,
      })),
    }));
    render(
      <TrendTable areaData={data} confidence="none" columns={columns} indicator={indicator('%')} />,
    );
    expect(screen.getByRole('columnheader', { name: 'Count' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Numerator' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /Calculated value/ })).toBeNull();
    expect(
      screen.getByRole('columnheader', { name: '95% lower confidence interval' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('columnheader', { name: '99.8% lower confidence interval' }),
    ).toBeTruthy();
    const csv = trendCsv(
      indicator('%'),
      trendTableModel({ areaData: data, confidence: 'none' }),
      'none',
      columns,
    );
    expect(csv).toContain(
      'England count,England numerator,England lower 95% CI,England upper 95% CI,England lower 99.8% CI,England upper 99.8% CI',
    );
    expect(csv).toContain('2023,1024,512,11,13,10,14');
    expect(csv).not.toContain('calculated value');
  });
  it('shows a numerator column without a picker only when the data has numerators', () => {
    const withNumerators = areaData.map((area) => ({
      ...area,
      observations: area.observations.map((row) => ({ ...row, numerator: 512 })),
    }));
    const { rerender } = render(
      <TrendTable areaData={areaData} confidence="none" indicator={indicator(null)} />,
    );
    expect(screen.queryByRole('columnheader', { name: /^Numerator/ })).toBeNull();

    rerender(
      <TrendTable areaData={withNumerators} confidence="none" indicator={indicator(null)} />,
    );

    expect(screen.getByRole('columnheader', { name: 'Numerator (Raw number)' })).toBeTruthy();
  });
  it('shows no numerator column when an older API sends none', () => {
    const older = areaData.map((area) => ({
      ...area,
      observations: area.observations.map(({ numerator: _, ...row }) => ({ ...row, count: 4 })),
    }));
    render(
      <TrendTable
        areaData={older as unknown as IndicatorAreaData[]}
        confidence="none"
        indicator={indicator(null)}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Count (Raw number)' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /^Numerator/ })).toBeNull();
  });

  it.each([
    ['with no unit', null, 'Calculated value', '12.3'],
    ['as a percentage', '%', 'Calculated value (%)', '12.3%'],
    ['per 100,000', 'per 100,000', 'Calculated value (per 100,000)', '12.3'],
  ])('heads and shows values %s', (_, unit, heading, value) => {
    render(<TrendTable areaData={areaData} confidence="none" indicator={indicator(unit)} />);

    const row = screen.getByRole('rowheader', { name: '2023' }).closest('tr');

    expect(screen.getByRole('columnheader', { name: heading })).toBeTruthy();
    expect(within(row as HTMLElement).getByRole('cell').textContent).toBe(value);
  });
});

it('uses the visible caption as the table accessible name', () => {
  render(
    <TrendTable visibleCaption areaData={areaData} confidence="none" indicator={indicator('%')} />,
  );
  const table = screen.getByRole('table', {
    name: 'Table: Resident population, England, All, table with 1 row and 2 columns',
  });
  expect(table.hasAttribute('aria-label')).toBe(false);
});

const observation = (fromDate: string, toDate: string, value: number) => ({
  fromDate,
  toDate,
  value,
  lowerCi95: value - 1,
  upperCi95: value + 1,
  lowerCi998: null,
  upperCi998: null,
  count: 40,
  numerator: null,
  denominator: null,
  notes: [],
  dimensions: [],
});

const benchmarked = {
  areaData: [
    {
      areaCode: 'E08000003',
      areaName: 'Manchester',
      observations: [observation('2023-04-01', '2024-03-31', 14)],
    },
    {
      areaCode: 'E92000001',
      areaName: 'England',
      observations: [observation('2023-04-01', '2024-03-31', 12)],
    },
  ],
  benchmarks: ['england'] as const,
  confidence: '95' as const,
  geography: { regionByCode: {}, levelByCode: { E08000003: 'Local authorities' } },
  indicator: {
    ...indicator('%'),
    yearType: { value: 'financial' as const, label: 'Financial' },
    polarity: 'higher-is-better',
    comparatorMethod: 'Confidence intervals overlapping reference value',
  } as IndicatorDetail,
  ranges: {
    'Local authorities': [
      {
        fromDate: '2023-04-01',
        toDate: '2024-03-31',
        segment: '',
        min: 5,
        max: 30,
        p25: 10,
        p75: 20,
      },
    ],
  },
};

const allColumns: TrendColumns = {
  count: true,
  numerator: false,
  value: true,
  confidence: ['95'],
  minMax: true,
  percentiles: true,
  chart: true,
};

describe('TrendTable benchmark columns', () => {
  it.each([false, true])(
    'orders shared England and region groups for two areas (same region: %s)',
    (sameRegion) => {
      const second = {
        areaCode: 'E06000052',
        areaName: 'Cornwall',
        observations: [observation('2023-04-01', '2024-03-31', 18)],
      };
      const northWest = { code: 'E12000002', name: 'North West' };
      const southWest = { code: 'E12000009', name: 'South West' };
      const region = sameRegion ? northWest : southWest;
      const columns = { ...allColumns, count: false };
      render(
        <TrendTable
          {...benchmarked}
          benchmarks={['region', 'england', 'england']}
          areaData={[...benchmarked.areaData, second]}
          geography={{
            regionByCode: { E08000003: northWest, E06000052: region },
            levelByCode: { E08000003: 'Local authorities', E06000052: 'Local authorities' },
          }}
          ranges={{
            ...benchmarked.ranges,
            'Statistical regions': benchmarked.ranges['Local authorities'],
          }}
          regionData={[
            {
              areaCode: northWest.code,
              areaName: northWest.name,
              observations: [observation('2023-04-01', '2024-03-31', 15)],
            },
            {
              areaCode: southWest.code,
              areaName: southWest.name,
              observations: [observation('2023-04-01', '2024-03-31', 16)],
            },
          ]}
          columns={columns}
          visibleCaption
        />,
      );
      const benchmarkHeadings = [
        'Calculated value (%)',
        'Lowest',
        '25th percentile',
        '75th percentile',
        'Highest',
      ];
      const areaHeadings = (name: string) => [
        'Calculated value (%)',
        'Compared with England',
        `Compared with ${name}`,
        '95% lower confidence interval',
        '95% upper confidence interval',
      ];
      expect(
        screen.getAllByRole('columnheader').map((heading) => heading.textContent?.trim()),
      ).toEqual([
        'Manchester',
        'Cornwall',
        'England',
        'North West (Statistical region)',
        ...(sameRegion ? [] : ['South West (Statistical region)']),
        'Period',
        ...areaHeadings(northWest.name),
        ...areaHeadings(region.name),
        ...benchmarkHeadings,
        ...benchmarkHeadings,
        ...(sameRegion ? [] : benchmarkHeadings),
      ]);
      expect(screen.getAllByRole('columnheader', { name: 'England' })).toHaveLength(1);
      const table = screen.getByRole('table', {
        name: new RegExp(`table with 1 row and ${sameRegion ? 21 : 26} columns$`),
      });
      const row = within(table).getByRole('rowheader', { name: '2023 to 2024' }).closest('tr');
      if (!row) throw new Error('Trend row missing');
      const cells = within(row).getAllByRole('cell');
      expect(cells).toHaveLength(sameRegion ? 20 : 25);
      expect(cells[1]?.textContent).toContain('England: 12.0%');
      expect(cells[2]?.textContent).toContain('North West (Statistical region): 15.0%');
      expect(cells[7]?.textContent).toContain(
        `${region.name} (Statistical region): ${sameRegion ? '15.0%' : '16.0%'}`,
      );
      for (const cell of cells) {
        for (const id of (cell.getAttribute('headers') ?? '').split(' '))
          expect(document.getElementById(id)).toBeTruthy();
      }
    },
  );

  it('shows the area-level spread when England has no observation for the period', () => {
    render(
      <TrendTable
        {...benchmarked}
        areaData={benchmarked.areaData.slice(0, 1)}
        columns={allColumns}
      />,
    );
    const row = screen.getByRole('rowheader', { name: '2023 to 2024' }).closest('tr');
    if (!row) throw new Error('Trend row missing');
    const cells = within(row).getAllByRole('cell');
    expect(cells[2]?.textContent).toBe('-');
    expect(cells.slice(-5).map((cell) => cell.textContent)).toEqual([
      '-',
      '5.0%',
      '10.0%',
      '20.0%',
      '30.0%',
    ]);
  });

  it.each(['england', 'region'] as const)(
    'lets the spread toggles remove every spread column even when the %s benchmark has no data',
    (benchmark) => {
      const props = {
        ...benchmarked,
        benchmarks: [benchmark],
        areaData: benchmarked.areaData.slice(0, 1),
        geography: {
          ...benchmarked.geography,
          regionByCode: { E08000003: { code: 'E12000002', name: 'North West' } },
        },
        ranges: {},
        columns: allColumns,
      };
      const { rerender } = render(<TrendTable {...props} visibleCaption />);
      expect(screen.getByRole('columnheader', { name: 'Lowest' })).toBeTruthy();
      expect(screen.getByRole('columnheader', { name: '25th percentile' })).toBeTruthy();
      rerender(
        <TrendTable
          {...props}
          columns={{ ...allColumns, minMax: false, percentiles: false, chart: false }}
          visibleCaption
        />,
      );
      for (const name of [
        'Lowest',
        'Highest',
        '25th percentile',
        '75th percentile',
        /^Compared with/,
      ]) {
        expect(screen.queryByRole('columnheader', { name })).toBeNull();
      }
      const table = screen.getByRole('table', { name: /table with 1 row and 6 columns$/ });
      expect(within(table).getAllByRole('cell')).toHaveLength(5);
      expect(within(table).getAllByRole('cell').at(-1)?.textContent).toBe('-');
    },
  );

  it.each([
    ['chart', { chart: true }, 3],
    ['minimum and maximum', { minMax: true }, 4],
    ['percentiles', { percentiles: true }, 4],
  ])(
    'renders only the %s and benchmark columns when measures are unchecked',
    (_, choice, columnCount) => {
      render(
        <TrendTable
          {...benchmarked}
          columns={{
            count: false,
            numerator: false,
            value: false,
            confidence: [],
            minMax: false,
            percentiles: false,
            chart: false,
            ...choice,
          }}
          visibleCaption
        />,
      );
      expect(screen.queryByText('Select at least one table column.')).toBeNull();
      const table = screen.getByRole('table', {
        name: new RegExp(`table with 1 row and ${columnCount} columns$`),
      });
      expect(within(table).getAllByRole('cell')).toHaveLength(columnCount - 1);
      expect(table.querySelector('[colspan="0"]')).toBeNull();
    },
  );

  it('asks for a column when no selected column can be shown without a benchmark', () => {
    render(
      <TrendTable
        {...benchmarked}
        benchmarks={[]}
        columns={{ ...allColumns, count: false, value: false, confidence: [] }}
      />,
    );
    expect(screen.getByText('Select at least one table column.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it.each([
    ['no ranges', {}],
    ['empty ranges', { 'Local authorities': [] }],
    [
      'another period',
      {
        'Local authorities': benchmarked.ranges['Local authorities'].map((range) => ({
          ...range,
          fromDate: '2022-04-01',
          toDate: '2023-03-31',
        })),
      },
    ],
    [
      'another segment',
      {
        'Local authorities': benchmarked.ranges['Local authorities'].map((range) => ({
          ...range,
          segment: 'Male',
        })),
      },
    ],
  ])('hides the chart key with %s', (_, ranges) => {
    render(<TrendTable {...benchmarked} ranges={ranges} columns={allColumns} />);
    expect(screen.queryByText('Key to the comparison chart')).toBeNull();
    expect(document.querySelector('.fphd-range-slot')).toBeNull();
  });

  it('orders the area columns as value, count, chart, intervals and the benchmark as value, spread', () => {
    render(<TrendTable {...benchmarked} columns={allColumns} visibleCaption />);
    expect(screen.getByText('Key to the comparison chart')).toBeTruthy();
    const headings = screen
      .getAllByRole('columnheader')
      .map((heading) => heading.textContent?.trim());

    expect(headings).toEqual([
      'Manchester',
      'England',
      'Period',
      'Calculated value (%)',
      'Count',
      'Compared with England',
      '95% lower confidence interval',
      '95% upper confidence interval',
      'Calculated value (%)',
      'Lowest',
      '25th percentile',
      '75th percentile',
      'Highest',
    ]);
    const row = screen.getByRole('rowheader', { name: '2023 to 2024' }).closest('tr');
    expect(
      [...(row as HTMLElement).querySelectorAll('td')].map((cell) => cell.textContent),
    ).toEqual([
      '14.0%',
      '40',
      'Manchester: 14.0%. England: 12.0%. Range: 5.0% to 30.0%. 25th percentile: 10.0%. 75th percentile: 20.0%. Better than benchmark',
      '13.0%',
      '15.0%',
      '12.0%',
      '5.0%',
      '10.0%',
      '20.0%',
      '30.0%',
    ]);
  });

  it.each([
    ['minimum and maximum', { minMax: true }, ['Lowest', 'Highest']],
    ['percentiles', { percentiles: true }, ['25th percentile', '75th percentile']],
    ['comparison chart', { chart: true }, ['Compared with England']],
  ])('shows the %s on their own', (_, choice, shown) => {
    render(
      <TrendTable
        {...benchmarked}
        columns={{ ...allColumns, minMax: false, percentiles: false, chart: false, ...choice }}
      />,
    );
    const spread = [
      'Lowest',
      '25th percentile',
      '75th percentile',
      'Highest',
      'Compared with England',
    ];
    for (const name of spread) {
      expect(screen.queryAllByRole('columnheader', { name })).toHaveLength(
        shown.includes(name) ? 1 : 0,
      );
    }
  });

  it('names each data cell by its period, its group and its column heading', () => {
    render(<TrendTable {...benchmarked} columns={allColumns} visibleCaption />);
    const row = screen.getByRole('rowheader', { name: '2023 to 2024' });
    const cells = (row.closest('tr') as HTMLElement).querySelectorAll('td');
    const names = (cell: Element) =>
      (cell.getAttribute('headers') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent?.trim());

    expect(names(cells[0] as Element)).toEqual([
      '2023 to 2024',
      'Manchester',
      'Calculated value (%)',
    ]);
    expect(names(cells[9] as Element)).toEqual(['2023 to 2024', 'England', 'Highest']);
  });

  it('counts a single area by name and several as chosen areas in the caption', () => {
    const second = {
      areaCode: 'E08000007',
      areaName: 'Stockport',
      observations: [observation('2023-04-01', '2024-03-31', 11)],
    };
    render(
      <TrendTable
        {...benchmarked}
        areaData={[...benchmarked.areaData, second]}
        columns={{ ...allColumns, count: false, confidence: [] }}
        visibleCaption
      />,
    );

    expect(
      screen.getByRole('table', {
        name: 'Table: Resident population, 2 chosen areas, All, table with 1 row and 10 columns',
      }),
    ).toBeTruthy();
  });
});
