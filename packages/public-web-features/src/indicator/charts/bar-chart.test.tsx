// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { cloneElement, type ReactElement, type Ref } from 'react';
import { createRoutesStub } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { indicatorComparisonModel } from '../comparison-model.ts';
import { benchmarkJudgement } from '../data.ts';
import { inequalityTableModel } from '../inequalities.ts';
import { InequalitiesTab } from '../inequalities-tab.tsx';
import type { IndicatorAreaData, IndicatorRangePeriod, SelectedIndicator } from '../loader.ts';
import { AreaComparisonTable } from '../tables/area-comparison-table.tsx';
import { deprivation, indicatorDetail, observation } from '../view.testing.ts';
import { CompareAreasChart, InequalitiesChart } from './bar-chart.tsx';

vi.mock('./chart-elements.tsx', async (original) => ({
  ...(await original<typeof import('./chart-elements.tsx')>()),
  ChartCanvas: ({
    children,
    chartRef,
  }: {
    children: (id: string) => ReactElement;
    chartRef: Ref<HTMLDivElement>;
  }) => (
    <div ref={chartRef}>
      {cloneElement(children('description') as ReactElement<{ width: number; height: number }>, {
        width: 640,
        height: 400,
      })}
    </div>
  ),
}));

afterEach(cleanup);

const areas: IndicatorAreaData[] = [
  { areaCode: 'A', areaName: 'Area A', observations: [observation(10)] },
  { areaCode: 'B', areaName: 'Area B', observations: [observation(30)] },
];
const range: IndicatorRangePeriod = {
  fromDate: '2024-01-01',
  toDate: '2024-12-31',
  segment: '',
  min: 0,
  max: 50,
  p25: 10,
  p75: 40,
  quintileCutoffs: [10, 20, 30, 40],
};

function chart(ranges: SelectedIndicator['ranges']) {
  return render(
    <CompareAreasChart
      areas={areas}
      confidence="none"
      indicator={indicatorDetail()}
      colourByQuintile
      levelByCode={{ A: 'local-authorities', B: 'regions' }}
      ranges={ranges ?? {}}
    />,
  );
}

it.each([
  {},
  { 'local-authorities': [{ ...range, fromDate: '2023-01-01', toDate: '2023-12-31' }] },
  { 'local-authorities': [{ ...range, quintileCutoffs: null }] },
])('does not claim quintile colours when matching ranges are unavailable: %j', (ranges) => {
  chart(ranges);
  const key = screen.getByRole('list', { name: 'Quintile key' });
  expect(
    within(key)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Quintile unavailable']);
  expect(key.querySelector('rect')?.getAttribute('fill')).toBe('#505a5f');
});

it('includes the unavailable colour alongside quintiles actually used by the bars', () => {
  chart({ 'local-authorities': [range] });
  const key = screen.getByRole('list', { name: 'Quintile key' });
  expect(
    within(key)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Quintile 1 (lowest)', 'Quintile unavailable']);
});

it('shows the represented quintiles when both levels have matching ranges', () => {
  chart({ 'local-authorities': [range], regions: [range] });
  const key = screen.getByRole('list', { name: 'Quintile key' });
  expect(
    within(key)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Quintile 1 (lowest)', 'Quintile 3']);
});

it('keeps quintile colours and omits the England line in quintile mode', () => {
  const { container } = render(
    <CompareAreasChart
      areas={[
        ...areas,
        { areaCode: 'E92000001', areaName: 'England', observations: [observation(20)] },
      ]}
      confidence="95"
      indicator={indicatorDetail()}
      colourByQuintile
      levelByCode={{ A: 'local-authorities', B: 'local-authorities' }}
      ranges={{ 'local-authorities': [range] }}
    />,
  );
  expect(
    [...container.querySelectorAll('.recharts-bar-rectangle path')].map((bar) =>
      bar.getAttribute('fill'),
    ),
  ).toEqual(['#27a096', '#c5eee9']);
  expect(container.querySelector('.recharts-reference-line-line')).toBeNull();
});

it('does not add an unavailable quintile for an area without a bar in the latest period', () => {
  render(
    <CompareAreasChart
      areas={[
        areas[0] as IndicatorAreaData,
        {
          ...(areas[1] as IndicatorAreaData),
          observations: [{ ...observation(30), fromDate: '2023-01-01', toDate: '2023-12-31' }],
        },
      ]}
      confidence="none"
      indicator={indicatorDetail()}
      colourByQuintile
      levelByCode={{ A: 'local-authorities', B: 'regions' }}
      ranges={{ 'local-authorities': [range] }}
    />,
  );
  const key = screen.getByRole('list', { name: 'Quintile key' });
  expect(
    within(key)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Quintile 1 (lowest)']);
});

it.each(['higher-is-better', 'lower-is-better', 'no-polarity', 'no-comparison-possible'] as const)(
  'matches the table Compared with England judgements and colours for %s',
  (polarity) => {
    const detail = indicatorDetail(108, { polarity });
    const areaData: IndicatorAreaData[] = [
      { areaCode: 'E92000001', areaName: 'England', observations: [observation(10.2)] },
      ...[8, 9.8, 10.2, 12, 50].map((value) => ({
        areaCode: String(value),
        areaName: `Area ${value}`,
        observations: [
          {
            ...observation(value),
            lowerCi95: value === 50 ? 5 : value - 0.1,
            upperCi95: value === 50 ? 55 : value + 0.1,
          },
        ],
      })),
      {
        areaCode: 'missing-ci',
        areaName: 'Missing interval',
        observations: [{ ...observation(20), lowerCi95: null, upperCi95: null }],
      },
    ];
    const primary = { detail, areaData };
    const model = indicatorComparisonModel([primary], {
      compareAreasData: areaData,
      comparedAreasData: [],
      compareAreaOptions: [],
      compareAreaGroup: 'Local authorities',
      comparisonDisplayGroups: [],
    }).areas;
    const colours: Record<string, string> = {
      Better: '#8ed973',
      Similar: polarity === 'no-polarity' ? '#698AAB' : '#ffc000',
      Worse: '#c00000',
      Higher: '#0E3F69',
      Lower: '#CEE0F3',
      '': '#505a5f',
    };
    for (const confidence of ['none', '95', '99.8'] as const) {
      const { container, unmount } = render(
        <>
          <AreaComparisonTable
            indicator={primary}
            model={model}
            sort="descending"
            highlighted={[]}
          />
          <CompareAreasChart
            areas={areaData}
            confidence={confidence}
            indicator={detail}
            colourByQuintile={false}
            levelByCode={{}}
            ranges={{}}
          />
        </>,
      );
      const tableRows = container.querySelectorAll('.fphd-area-comparison-table tbody tr');
      const judgements = [...tableRows].slice(1).map((row) => row.children[2]?.textContent ?? '');
      expect(new Set(judgements).size).toBe(polarity === 'no-comparison-possible' ? 1 : 4);
      const chart = container.querySelector('.fphd-chart-section');
      // Each bar's judgement is the key's label for its colour.
      const keyLabels = new Map(
        [...(chart?.querySelectorAll('.fphd-chart-key li') ?? [])].map((item) => [
          item.querySelector('rect')?.getAttribute('fill'),
          item.textContent,
        ]),
      );
      expect(
        [...(chart?.querySelectorAll('.recharts-bar-rectangle path') ?? [])].map((bar) =>
          keyLabels.get(bar.getAttribute('fill')),
        ),
      ).toEqual(
        judgements.map((label) =>
          label
            ? `${label} ${label === 'Similar' ? 'to' : 'than'} England`
            : 'Not compared with England',
        ),
      );
      expect(
        [...(chart?.querySelectorAll('.recharts-bar-rectangle path') ?? [])].map((bar) =>
          bar.getAttribute('fill'),
        ),
      ).toEqual(judgements.map((label) => colours[label]));
      const key = [...(chart?.querySelectorAll('.fphd-chart-key li') ?? [])];
      expect(key.length).toBeGreaterThan(0);
      for (const item of key) {
        const label = item.textContent?.startsWith('Not compared')
          ? ''
          : (item.textContent?.split(' ')[0] ?? '');
        expect(item.querySelector('rect')?.getAttribute('fill')).toBe(colours[label]);
      }
      expect(chart?.textContent).toContain('England 10.2%');
      expect(chart?.textContent).not.toContain('average');
      expect(
        chart?.querySelector('.recharts-reference-line-line')?.getAttribute('stroke-width'),
      ).toBe('1');
      unmount();
    }
  },
);

it.each([
  undefined,
  { ...observation(40), fromDate: '2023-01-01', toDate: '2023-12-31' },
  { ...observation(), value: null },
])(
  'does not invent an England reference when its matching observation is missing: %j',
  (england) => {
    const { container } = render(
      <CompareAreasChart
        areas={[
          ...areas,
          { areaCode: 'E92000001', areaName: 'England', observations: england ? [england] : [] },
        ]}
        confidence="none"
        indicator={indicatorDetail()}
        colourByQuintile={false}
        levelByCode={{}}
        ranges={{}}
      />,
    );
    expect(container.querySelector('.recharts-reference-line-line')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Comparison key' })).toBeNull();
  },
);

it('omits the line and comparisons when no England benchmark exists', () => {
  const { container } = render(
    <InequalitiesChart
      id="inequalities"
      observations={[8, 12].map((value) => ({
        ...observation(value, [{ ...deprivation, value: `Decile ${value}` }]),
        comparison: 'none',
      }))}
      indicator={indicatorDetail(108, { unit: '%' })}
      confidence="none"
      benchmark={null}
      areaName="Cornwall"
    />,
  );
  expect(container.querySelector('.recharts-reference-line-line')).toBeNull();
  expect(container.textContent).not.toContain('average');
  expect(container.textContent).toContain('No England benchmark is available for this selection.');
  expect(screen.queryByRole('list', { name: 'Comparison key' })).toBeNull();
});

function ethnicGroupsIndicator(): SelectedIndicator {
  const period = { fromDate: '2018-04-01', toDate: '2019-03-31' };
  const england = { ...observation(56.5), ...period, count: 50732 };
  const groups = [
    ['Chinese', 68.5, 58.1, 77.4],
    ['Mixed', 61.1, 59.4, 62.8],
    ['Unknown', 55.0, 50.9, 59.0],
    ['Black', 64.3, 62.5, 66.1],
    ['Asian', 62.7, 60.9, 64.4],
    ['Other', 57.8, 54.7, 60.9],
    ['White', 54.3, 53.7, 54.9],
  ] as const;
  return {
    detail: indicatorDetail(90632),
    areaData: [
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: [
          england,
          ...groups.map(([name, value, lower, upper], index) => ({
            ...observation(value, [
              {
                type: 'Ethnic groups',
                value: name,
                dimensionClass: 'inequality',
                sortOrder: index,
              },
            ]),
            ...period,
            count: name === 'Chinese' ? 213 : null,
            lowerCi95: name === 'Unknown' ? 54.8 : lower,
            upperCi95: name === 'Unknown' ? 55.2 : upper,
            lowerCi998: lower,
            upperCi998: upper,
          })),
        ],
      },
    ],
  };
}

function renderInequalities(primary: SelectedIndicator, search = '') {
  const Routes = createRoutesStub([
    { path: '/', Component: () => <InequalitiesTab primary={primary} /> },
  ]);
  return render(<Routes initialEntries={[`/${search}`]} />);
}

function expectMatchingInequalityJudgements(primary: SelectedIndicator, search: string) {
  const model = inequalityTableModel(primary, new URLSearchParams(search));
  const chart = screen.getByRole('region', { name: /^Inequalities:/ });
  const table = screen.getByRole('table');
  const labels = new Map(
    [...chart.querySelectorAll('.fphd-chart-key li')].map((item) => [
      item.querySelector('rect')?.getAttribute('fill'),
      item.textContent,
    ]),
  );
  const expectedLabels = {
    better: 'Better than England',
    similar: 'Similar to England',
    worse: 'Worse than England',
    higher: 'Higher than England',
    lower: 'Lower than England',
    none: '',
  };
  const colours = {
    better: '#8ed973',
    similar: primary.detail.polarity === 'no-polarity' ? '#698AAB' : '#ffc000',
    worse: '#c00000',
    higher: '#0E3F69',
    lower: '#CEE0F3',
    none: '#505a5f',
  };
  const bars = [...chart.querySelectorAll('.recharts-bar-rectangle path')];
  const sorted = [...model.rows].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const judgementLevel =
    model.comparisonConfidence === 'none'
      ? model.confidenceLevels.includes('99.8')
        ? '99.8'
        : '95'
      : model.comparisonConfidence;
  expect(bars).toHaveLength(sorted.length);
  sorted.forEach((row, index) => {
    const judgement = benchmarkJudgement(
      row,
      model.benchmark?.value ?? null,
      primary.detail,
      judgementLevel,
    );
    const name = row.dimensions.find(({ type }) => type === model.category)?.value ?? '';
    const tableRow = within(table).getByRole('rowheader', { name }).closest('tr');
    const tableLabel = tableRow?.lastElementChild?.textContent;
    expect(tableLabel, name).toBe(expectedLabels[judgement]);
    const fill = bars[index]?.getAttribute('fill');
    expect(fill, name).toBe(colours[judgement]);
    expect(labels.get(fill), name).toBe(tableLabel || 'Not compared with England');
  });
  const englandRow = within(table).getByRole('rowheader', { name: 'England' }).closest('tr');
  expect(englandRow?.textContent).toContain('50,732');
  const englandValue = englandRow?.children[2]?.textContent;
  expect(englandValue).toBe('56.5%');
  expect(chart.textContent).toContain(`England average ${englandValue}`);
  expect(chart.querySelector('.recharts-reference-line-line')).toBeTruthy();
  return model;
}

it('uses the 90632 England observation instead of the unweighted ethnic group mean', () => {
  const primary = ethnicGroupsIndicator();
  renderInequalities(primary);
  expect(screen.getByRole('region', { name: /^Inequalities:/ }).textContent).toContain(
    'England average 56.5%',
  );
  const model = expectMatchingInequalityJudgements(primary, '');
  expect(model.comparisonConfidence).toBe('99.8');
  expect(model.rows.map(({ comparison }) => comparison)).toEqual([
    'better',
    'better',
    'similar',
    'better',
    'better',
    'similar',
    'worse',
  ]);
});

it.each(['', '?ci-90632=95', '?ci-90632=99.8', '?ci-90632=none'])(
  'matches the table at every confidence selection: %s',
  (search) => {
    const primary = ethnicGroupsIndicator();
    renderInequalities(primary, search);
    const model = expectMatchingInequalityJudgements(primary, search);
    expect(model.rows[2]?.comparison).toBe(search.endsWith('=95') ? 'worse' : 'similar');
  },
);

it.each([
  ['lower-is-better', 'Confidence intervals overlapping reference value'],
  ['no-polarity', 'Confidence intervals overlapping reference value'],
  ['no-comparison-possible', 'Confidence intervals overlapping reference value'],
  [null, 'Confidence intervals overlapping reference value'],
  ['higher-is-better', 'Unsupported method'],
  ['lower-is-better', 'No comparison'],
  ['higher-is-better', null],
  ['no-polarity', null],
] as const)('matches polarity %s and comparator %s', (polarity, comparatorMethod) => {
  const primary = ethnicGroupsIndicator();
  primary.detail = { ...primary.detail, polarity, comparatorMethod };
  renderInequalities(primary);
  expectMatchingInequalityJudgements(primary, '');
});

it.each(['95', '99.8'] as const)(
  'requires the selected %s interval without falling back',
  (level) => {
    const primary = ethnicGroupsIndicator();
    const chinese = primary.areaData[0]?.observations[1];
    if (!chinese) throw new Error('Missing Chinese test observation');
    if (level === '95') {
      chinese.lowerCi95 = null;
      chinese.upperCi95 = null;
    } else {
      chinese.lowerCi998 = null;
      chinese.upperCi998 = null;
    }
    const search = `?ci-90632=${level}`;
    renderInequalities(primary, search);
    expect(expectMatchingInequalityJudgements(primary, search).rows[0]?.comparison).toBe('none');
  },
);

it('does not apply a similar band when the selected interval excludes England by less than 0.5', () => {
  const primary = ethnicGroupsIndicator();
  const chinese = primary.areaData[0]?.observations[1];
  if (!chinese) throw new Error('Missing Chinese test observation');
  Object.assign(chinese, { value: 56.7, lowerCi998: 56.6, upperCi998: 56.8 });
  renderInequalities(primary);
  expect(expectMatchingInequalityJudgements(primary, '').rows[0]?.comparison).toBe('better');
});

it.each(['missing', 'period', 'segment', 'null-value'])(
  'shows unavailable comparisons without inventing an average when England is %s',
  (reason) => {
    const primary = ethnicGroupsIndicator();
    const area = primary.areaData[0];
    const england = area?.observations[0];
    if (!area || !england) throw new Error('Missing England test observation');
    if (reason === 'missing') area.observations = area.observations.slice(1);
    if (reason === 'period') england.fromDate = '2017-04-01';
    if (reason === 'segment')
      england.dimensions = [{ type: 'Age', value: '18+', dimensionClass: 'core', sortOrder: 0 }];
    if (reason === 'null-value') england.value = null;
    // Keep the breakdown's baseline independent of an unavailable England headline.
    primary.areaData.push({
      areaCode: 'A',
      areaName: 'Area A',
      observations: [observation(10), ...area.observations.slice(reason === 'missing' ? 0 : 1)],
    });
    renderInequalities(primary, '?ig-90632=A');
    const chart = screen.getByRole('region', { name: /^Inequalities:/ });
    expect(chart.querySelector('.recharts-reference-line-line')).toBeNull();
    expect(within(chart).queryByRole('list', { name: 'Comparison key' })).toBeNull();
    expect(chart.textContent).toContain('No England benchmark is available for this selection.');
    expect(chart.textContent).not.toContain('average');
    expect(
      [...chart.querySelectorAll('.recharts-bar-rectangle path')].map((bar) =>
        bar.getAttribute('fill'),
      ),
    ).toEqual(Array(7).fill('#12436d'));
    const table = screen.getByRole('table');
    const rows = [...table.querySelectorAll('tbody tr')];
    expect(rows[0]?.children[2]?.textContent).toBe('No data');
    expect(rows.slice(1).map((row) => row.lastElementChild?.textContent)).toEqual(
      Array(7).fill(''),
    );
  },
);
