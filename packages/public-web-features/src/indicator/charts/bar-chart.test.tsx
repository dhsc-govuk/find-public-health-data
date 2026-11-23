// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { cloneElement, type ReactElement, type Ref } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { indicatorComparisonModel } from '../comparison-model.ts';
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

it('names the chosen area for the average of its inequality bars', () => {
  const { container } = render(
    <InequalitiesChart
      id="inequalities"
      observations={[8, 12].map((value) =>
        observation(value, [{ ...deprivation, value: `Decile ${value}` }]),
      )}
      indicator={indicatorDetail(108, { unit: '%' })}
      confidence="none"
      comparisonConfidence="95"
      areaName="Cornwall"
      englandObservations={[]}
    />,
  );
  expect(container.textContent).toContain('Cornwall average 10.0%');
  expect(container.textContent).not.toContain('England average');
});
