import { describe, expect, it } from 'vitest';

import { selectedTrendColumns, trendColumnsParam } from './trend.ts';

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
