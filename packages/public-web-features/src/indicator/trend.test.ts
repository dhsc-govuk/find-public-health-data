import { describe, expect, it } from 'vitest';

import {
  selectedTrendColumns,
  trendChartAreas,
  trendColumnsParam,
  trendTableModel,
} from './trend.ts';
import { observation } from './view.testing.ts';

describe('trendTableModel', () => {
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
