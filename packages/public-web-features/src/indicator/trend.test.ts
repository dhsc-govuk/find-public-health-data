import { describe, expect, it } from 'vitest';
import { benchmarkFixture } from './benchmark.testing.ts';

import {
  selectedTrendColumns,
  trendChartAreas,
  trendColumnsParam,
  trendTableModel,
} from './trend.ts';
import { observation, sex } from './view.testing.ts';

describe('trendTableModel', () => {
  it('aligns each IMD decile by period and exact remaining segment and uses its category range', () => {
    const fixture = benchmarkFixture();
    const membership = fixture.memberships[1];
    if (!membership) throw new Error('Missing IMD 2025 membership');
    const england = fixture.areaData[2];
    if (!england) throw new Error('Missing England');
    england.observations.unshift(
      {
        ...fixture.decileObservation(membership, 99),
        dimensions: [sex('Male'), ...fixture.decileObservation(membership, 99).dimensions.slice(1)],
      },
      { ...fixture.decileObservation(membership, 98), fromDate: '2023-01-01' },
      observation(97, [sex('Female')]),
    );
    const model = trendTableModel({ ...fixture, confidence: '95' });
    const benchmark = model.benchmarksByArea
      .get('E08000003')
      ?.find(({ choice }) => choice === 'imd2025');
    expect(benchmark?.series.map(({ value }) => value)).toEqual([8]);
    expect(benchmark?.series[0]?.dimensions).toEqual([sex('Female')]);
    expect(benchmark?.rangePeriods).toBe(fixture.ranges[membership.dimensionValueId]);
    expect(benchmark?.name).toBe('Decile 1 (IMD 2025)');
    expect(benchmark?.label).toBe('similarly deprived areas (IMD 2025)');
  });

  it.each([
    [10, 20, 15],
    [null, 20, 20],
    [null, null, null],
  ] as const)(
    'averages neighbour values %s and %s without intervals',
    (first, second, expected) => {
      const fixture = benchmarkFixture();
      const firstNeighbour = fixture.benchmarkData[0]?.observations[0];
      const secondNeighbour = fixture.benchmarkData[1]?.observations[0];
      if (!firstNeighbour || !secondNeighbour) throw new Error('Missing neighbours');
      firstNeighbour.value = first;
      secondNeighbour.value = second;
      fixture.benchmarkData[0]?.observations.unshift(observation(99, [sex('Male')]));
      const model = trendTableModel({ ...fixture, confidence: '95' });
      const benchmark = model.benchmarksByArea
        .get('E08000003')
        ?.find(({ choice }) => choice.startsWith('neighbours:'));
      expect(benchmark?.series[0]).toMatchObject({
        value: expected,
        lowerCi95: null,
        upperCi95: null,
        lowerCi998: null,
        upperCi998: null,
        count: null,
        numerator: null,
        denominator: null,
      });
      expect(benchmark?.rangePeriods).toBeUndefined();
    },
  );

  it('keeps value-only CA groups when published data is missing and includes every benchmark chart series', () => {
    const fixture = benchmarkFixture();
    const model = trendTableModel({ ...fixture, confidence: 'none', goal: fixture.detail.goal });
    expect(
      model.benchmarksByArea.get('E08000003')?.find(({ choice }) => choice.startsWith('ca:'))
        ?.series[0]?.value,
    ).toBe(9);
    expect(
      model.benchmarksByArea.get('E06000052')?.find(({ choice }) => choice.startsWith('ca:'))
        ?.series,
    ).toEqual([]);
    expect(model.benchmarkGroups.map(({ name }) => name)).toEqual([
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
    ]);
    expect(trendChartAreas(model).map(({ areaName }) => areaName)).toEqual([
      'Manchester',
      'Cornwall',
      'England',
      'North West',
      'South West',
      'Decile 1 (IMD 2019)',
      'Decile 2 (IMD 2019)',
      'Decile 1 (IMD 2025)',
      'Decile 2 (IMD 2025)',
      'Statistical neighbours (Manchester)',
      'Statistical neighbours (Cornwall)',
      'Combined authority (Manchester)',
      'Combined authority (Cornwall)',
    ]);
    expect(model.policyGoal).toBe(fixture.detail.goal);
  });
  it.each([false, true])('shares benchmark series across areas (same region: %s)', (sameRegion) => {
    const northWest = { code: 'E12000002', name: 'North West' };
    const southWest = { code: 'E12000009', name: 'South West' };
    const region = sameRegion ? northWest : southWest;
    const area = (areaCode: string, areaName: string, value: number) => ({
      areaCode,
      areaName,
      observations: [observation(value)],
    });
    const model = trendTableModel({
      areaData: [
        area('E08000003', 'Manchester', 14),
        area('E06000052', 'Cornwall', 18),
        area('E92000001', 'England', 12),
      ],
      benchmarks: ['region', 'england'],
      confidence: '95',
      geography: { regionByCode: { E08000003: northWest, E06000052: region }, levelByCode: {} },
      regionData: [
        area(northWest.code, northWest.name, 15),
        area(southWest.code, southWest.name, 16),
      ],
    });
    expect(model.benchmarkGroups.map(({ name }) => name)).toEqual([
      'England',
      'North West (Statistical region)',
      ...(sameRegion ? [] : ['South West (Statistical region)']),
    ]);
    expect(model.benchmarksByArea.get('E06000052')?.map(({ label }) => label)).toEqual([
      'England',
      region.name,
    ]);
    expect(trendChartAreas(model).map(({ areaName }) => areaName)).toEqual([
      'Manchester',
      'Cornwall',
      'England',
      'North West',
      ...(sameRegion ? [] : ['South West']),
    ]);
  });

  it('leaves benchmarks inactive while England is the only displayed geography', () => {
    const model = trendTableModel({
      areaData: [{ areaCode: 'E92000001', areaName: 'England', observations: [observation()] }],
      benchmarks: ['england', 'region'],
      confidence: 'none',
    });
    expect(model.benchmarkGroups).toEqual([]);
    expect(trendChartAreas(model).map(({ areaName }) => areaName)).toEqual(['England']);
  });
});

describe('selectedTrendColumns', () => {
  it('keeps only the chosen measures the data has', () => {
    const params = new URLSearchParams('columns-7=count,numerator,value');

    expect(selectedTrendColumns(params, 7, ['numerator', '95'])).toEqual({
      count: false,
      numerator: true,
      value: true,
      confidence: [],
      minMax: false,
      percentiles: false,
      chart: false,
      goal: false,
    });
  });

  it('shows the value, the first available interval and the benchmark spread when nothing is chosen', () => {
    expect(selectedTrendColumns(new URLSearchParams(), 7, ['count', '99.8'])).toEqual({
      count: false,
      numerator: false,
      value: true,
      confidence: ['99.8'],
      minMax: true,
      percentiles: true,
      chart: true,
      goal: true,
    });
  });

  it('toggles the minimum and maximum, the percentiles and the chart independently', () => {
    expect(
      selectedTrendColumns(new URLSearchParams('columns-7=value,percentiles'), 7, []),
    ).toMatchObject({ minMax: false, percentiles: true, chart: false });
    expect(
      selectedTrendColumns(new URLSearchParams('columns-7=minmax,chart'), 7, []),
    ).toMatchObject({ minMax: true, percentiles: false, chart: true });
  });
});

describe('trendColumnsParam', () => {
  it('lists the chosen columns in table order', () => {
    expect(
      trendColumnsParam({
        count: true,
        numerator: true,
        value: true,
        confidence: ['95'],
        minMax: true,
        percentiles: false,
        chart: true,
      }),
    ).toBe('count,numerator,value,95,minmax,chart');
  });

  it('says none when no column is chosen', () => {
    expect(
      trendColumnsParam({
        count: false,
        numerator: false,
        value: false,
        confidence: [],
        minMax: false,
        percentiles: false,
        chart: false,
      }),
    ).toBe('none');
  });
});
