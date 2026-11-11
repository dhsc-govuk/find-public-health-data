import { publicYearType } from '@fphd/utils/period-type';
import { describe, expect, it } from 'vitest';

import {
  alignedTrendSeries,
  availableMeasures,
  availablePeriodTypes,
  benchmarkJudgement,
  comparisonRows,
  confidenceInterval,
  dimensionValues,
  filterObservations,
  formatConfidenceInterval,
  formatValue,
  inequalityBreakdown,
  inequalityCategories,
  inequalityCategoryLabel,
  inequalityCategoryOptions,
  inequalityPeriods,
  inequalitySegments,
  inequalityValueLabel,
  periodCovered,
  recentTrend,
  segmentLabel,
  trendSeries,
  unitNote,
  withUnit,
} from './data.ts';

function obs(overrides = {}) {
  return {
    fromDate: '2023-01-01',
    toDate: '2023-12-31',
    value: 100,
    lowerCi95: 95,
    upperCi95: 105,
    lowerCi998: 92,
    upperCi998: 108,
    count: 1000,
    numerator: null,
    denominator: null,
    dimensions: [],
    notes: [],
    ...overrides,
  };
}

function dim(type: string, value: string, overrides = {}) {
  return { type, value, dimensionClass: 'core', sortOrder: 0, ...overrides };
}

describe('recentTrend', () => {
  it.each([undefined, 'up', 'right', null] as const)(
    'marks multi-year periods unavailable even with precomputed direction %s',
    (precomputed) => {
      expect(
        recentTrend(
          [obs({ fromDate: '2020-01-01', toDate: '2022-12-31' })],
          'higher-is-better',
          precomputed,
        ),
      ).toEqual({
        direction: null,
        label: 'Trend unavailable',
        tone: 'grey',
        reason: 'multi-year periods',
      });
    },
  );

  it.each([
    ['2021-02-04', 'Increasing and getting better'],
    ['2021-02-05', 'Trend unavailable'],
  ])('uses the 400-day boundary for periods ending %s', (toDate, label) => {
    expect(
      recentTrend([obs({ fromDate: '2020-01-01', toDate })], 'higher-is-better', 'up').label,
    ).toBe(label);
  });

  it('explains when there are too few valid annual observations', () => {
    expect(recentTrend([obs(), obs({ value: null })], null)).toEqual({
      direction: null,
      label: 'Trend unavailable',
      tone: 'grey',
      reason: 'not enough data points',
    });
  });
});

describe('periodCovered', () => {
  it('labels one span from the first start to the last end', () => {
    const rolling = [
      obs({ fromDate: '2013-04-01', toDate: '2018-03-31' }),
      obs({ fromDate: '2017-04-01', toDate: '2022-03-31' }),
      obs({ fromDate: '2014-04-01', toDate: '2019-03-31' }),
    ];

    expect(periodCovered(rolling, publicYearType('financial', null))).toBe('2013/14 to 2021/22');
  });

  it('takes the latest end even when a later start ends sooner', () => {
    const mixed = [
      obs({ fromDate: '2015-01-01', toDate: '2017-12-31' }),
      obs({ fromDate: '2016-01-01', toDate: '2016-12-31' }),
    ];

    expect(periodCovered(mixed)).toBe('2015 to 2017');
  });

  it('labels a single period as that period', () => {
    expect(periodCovered([obs()])).toBe('2023');
    expect(periodCovered([obs({ fromDate: '2026-01-01', toDate: '2026-03-31' })])).toBe(
      'January to March 2026',
    );
  });

  it('is empty without observations', () => {
    expect(periodCovered([])).toBe('');
  });
});

describe('segmentLabel', () => {
  it('joins dimension values', () => {
    expect(segmentLabel(obs({ dimensions: [dim('Sex', 'Male'), dim('Age', '<75 yrs')] }))).toBe(
      'Male, <75 yrs',
    );
  });

  it('labels the fully-aggregate observation as All', () => {
    expect(segmentLabel(obs())).toBe('All');
  });
});

describe('trendSeries', () => {
  it('returns the least-disaggregated segment in period order', () => {
    const aggregate2022 = obs({
      fromDate: '2022-01-01',
      toDate: '2022-12-31',
      dimensions: [dim('Age', '<75 yrs')],
    });
    const aggregate2023 = obs({ dimensions: [dim('Age', '<75 yrs')] });
    const sexed = obs({ dimensions: [dim('Age', '<75 yrs'), dim('Sex', 'Male')] });

    expect(trendSeries([sexed, aggregate2023, aggregate2022])).toEqual([
      aggregate2022,
      aggregate2023,
    ]);
  });

  it('prefers the longest series among equally-aggregated segments', () => {
    const male2022 = obs({
      fromDate: '2022-01-01',
      toDate: '2022-12-31',
      dimensions: [dim('Sex', 'Male')],
    });
    const male2023 = obs({ dimensions: [dim('Sex', 'Male')] });
    const female2023 = obs({ dimensions: [dim('Sex', 'Female')] });

    expect(trendSeries([female2023, male2023, male2022])).toEqual([male2022, male2023]);
  });

  it('returns empty for no observations', () => {
    expect(trendSeries([])).toEqual([]);
  });
});

describe('alignedTrendSeries', () => {
  it('follows the reference segment even when its own longest series differs', () => {
    // One area's longest series is Female while the benchmark's is Male — left
    // unaligned, the table would compare different sexes without saying so.
    const reference = obs({ dimensions: [dim('Sex', 'Female')] });
    const male2022 = obs({
      fromDate: '2022-01-01',
      toDate: '2022-12-31',
      dimensions: [dim('Sex', 'Male')],
    });
    const male2023 = obs({ dimensions: [dim('Sex', 'Male')] });
    const female2023 = obs({ dimensions: [dim('Sex', 'Female')] });

    expect(alignedTrendSeries([male2023, female2023, male2022], reference)).toEqual([female2023]);
  });

  it('falls back to its own trend series when the reference segment is not published', () => {
    const reference = obs({ dimensions: [dim('Sex', 'Female')] });
    const male = obs({ dimensions: [dim('Sex', 'Male')] });

    expect(alignedTrendSeries([male], reference)).toEqual([male]);
    expect(alignedTrendSeries([male], undefined)).toEqual([male]);
  });
});

describe('formatting', () => {
  it('formats values to one decimal place with grouping', () => {
    expect(formatValue(12345.67)).toBe('12,345.7');
    expect(formatValue(null)).toBe('No data');
  });

  it.each([
    ['%', '6.0%', ' (%)'],
    ['per 100,000', '6.0 per 100,000', ' (per 100,000)'],
    [null, '6.0', ''],
  ])('puts the unit %s beside a value and after a heading', (unit, value, note) => {
    expect(withUnit('6.0', unit)).toBe(value);
    expect(unitNote(unit)).toBe(note);
  });

  it('formats a confidence interval as a range', () => {
    expect(formatConfidenceInterval(obs())).toBe('95 to 105');
    expect(formatConfidenceInterval(obs({ lowerCi95: null }))).toBe('—');
  });
});

describe('comparisonRows', () => {
  const detail = (shortId: number, name: string) =>
    ({
      shortId,
      name,
      unit: 'per 100,000',
    }) as never;

  it('takes each indicator’s latest value in the first selected area', () => {
    const rows = comparisonRows([
      {
        detail: detail(108, 'Mortality'),
        areaData: [
          {
            areaCode: 'E92000001',
            areaName: 'England',
            observations: [
              obs({ fromDate: '2022-01-01', toDate: '2022-12-31', value: 342.2 }),
              obs({ value: 341.1 }),
            ],
          },
        ],
      },
      {
        detail: detail(90366, 'Life expectancy'),
        areaData: [
          { areaCode: 'E92000001', areaName: 'England', observations: [obs({ value: 80.1 })] },
        ],
      },
    ]);

    expect(rows.map((r) => [r.name, r.value, r.period])).toEqual([
      ['Mortality', 341.1, '2023'],
      ['Life expectancy', 80.1, '2023'],
    ]);
    expect(rows.every((r) => r.suffix === '')).toBe(true);
    expect(rows[0]?.areaName).toBe('England');
  });

  it('keeps an indicator with no data in the table rather than dropping it', () => {
    const rows = comparisonRows([
      {
        detail: detail(93622, 'No data here'),
        areaData: [{ areaCode: 'E92000001', areaName: 'England', observations: [] }],
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBeNull();
    expect(rows[0]?.period).toBe('');
  });
});

describe('filterObservations', () => {
  const male = obs({ dimensions: [dim('Sex', 'Male')] });
  const female = obs({ dimensions: [dim('Sex', 'Female')] });
  const persons = obs({ dimensions: [] });
  const rolling = obs({ fromDate: '2021-01-01', toDate: '2023-12-31', dimensions: [] });

  it('keeps only the chosen sex, so the selection visibly changes the series', () => {
    expect(filterObservations([male, female, persons], { sex: 'Male' })).toEqual([male]);
    expect(filterObservations([male, female, persons], { sex: '' })).toEqual([
      male,
      female,
      persons,
    ]);
  });

  it('separates single-year periods from rolling averages', () => {
    expect(filterObservations([persons, rolling], { periodType: '1-year' })).toEqual([persons]);
    expect(filterObservations([persons, rolling], { periodType: '3-year' })).toEqual([rolling]);
    expect(filterObservations([persons, rolling], { periodType: 'all' })).toEqual([
      persons,
      rolling,
    ]);
  });
});

describe('availablePeriodTypes', () => {
  const single = obs({ dimensions: [] });
  const rolling = obs({ fromDate: '2021-01-01', toDate: '2023-12-31', dimensions: [] });

  it('offers only the period shapes the observations contain', () => {
    expect(availablePeriodTypes([single])).toEqual(['1-year']);
    expect(availablePeriodTypes([rolling])).toEqual(['3-year']);
    expect(availablePeriodTypes([single, rolling])).toEqual(['1-year', '3-year']);
    expect(availablePeriodTypes([])).toEqual([]);
  });
});

describe('availableMeasures', () => {
  it('offers only the raw numbers the observations carry', () => {
    const rate = obs({ count: null, numerator: 40 });

    expect(availableMeasures([obs()])).toEqual(['count']);
    expect(availableMeasures([rate])).toEqual(['numerator']);
    expect(availableMeasures([obs(), rate])).toEqual(['count', 'numerator']);
    expect(availableMeasures([obs({ count: null })])).toEqual([]);
  });

  it('offers no numerator when an older API sends none', () => {
    const { numerator: _, ...older } = obs();

    expect(availableMeasures([older as ReturnType<typeof obs>])).toEqual(['count']);
  });
});

describe('dimensionValues', () => {
  it('lists a dimension’s distinct values in sort order', () => {
    expect(
      dimensionValues(
        [
          obs({ dimensions: [dim('Sex', 'Female', { sortOrder: 2 })] }),
          obs({ dimensions: [dim('Sex', 'Male', { sortOrder: 1 })] }),
          obs({ dimensions: [dim('Sex', 'Male', { sortOrder: 1 })] }),
        ],
        'Sex',
      ),
    ).toEqual(['Male', 'Female']);
  });
});

describe('inequalitySegments', () => {
  it('picks the inequality dimension with the most values in the latest period', () => {
    const deprivation = (name: string) =>
      obs({ dimensions: [dim('Deprivation deciles', name, { dimensionClass: 'inequality' })] });
    const ethnicity = obs({
      dimensions: [dim('Ethnic group', 'White', { dimensionClass: 'inequality' })],
    });
    const core = obs({ dimensions: [dim('Sex', 'Male')] });

    const result = inequalitySegments([
      core,
      ethnicity,
      deprivation('Most deprived'),
      deprivation('Least deprived'),
    ]);

    expect(result.map((o) => o.dimensions[0]?.type)).toEqual([
      'Deprivation deciles',
      'Deprivation deciles',
    ]);
  });

  it('returns nothing when an indicator has no inequality breakdown', () => {
    expect(inequalitySegments([obs({ dimensions: [dim('Sex', 'Male')] })])).toEqual([]);
  });
});

describe('confidenceInterval', () => {
  it('reads the interval for the chosen level', () => {
    expect(confidenceInterval(obs(), '95')).toBe('95 to 105');
    expect(confidenceInterval(obs(), '99.8')).toBe('92 to 108');
  });

  it('shows nothing at all when intervals are turned off', () => {
    expect(confidenceInterval(obs(), 'none')).toBe('');
  });

  it('marks an interval the source does not carry', () => {
    expect(confidenceInterval(obs({ lowerCi998: null }), '99.8')).toBe('—');
  });
});

describe('benchmarkJudgement', () => {
  const ciIndicator = {
    polarity: 'lower-is-better' as const,
    comparatorMethod: 'Confidence intervals overlapping reference value (95.0 & 99.8)',
  };

  it('judges significance from the confidence interval against the benchmark', () => {
    expect(
      benchmarkJudgement(obs({ value: 90, lowerCi95: 85, upperCi95: 95 }), 100, ciIndicator),
    ).toBe('better');
    expect(
      benchmarkJudgement(obs({ value: 110, lowerCi95: 105, upperCi95: 115 }), 100, ciIndicator),
    ).toBe('worse');
    expect(
      benchmarkJudgement(obs({ value: 99, lowerCi95: 95, upperCi95: 105 }), 100, ciIndicator),
    ).toBe('similar');
  });

  it('uses the 99.8 interval when that level is selected', () => {
    const wide = obs({ value: 90, lowerCi95: 85, upperCi95: 95, lowerCi998: 80, upperCi998: 105 });
    expect(benchmarkJudgement(wide, 100, ciIndicator, '99.8')).toBe('similar');
  });

  it('refuses to judge without a sanctioned comparator or intervals', () => {
    expect(
      benchmarkJudgement(obs({ value: 90, lowerCi95: 85, upperCi95: 95 }), 100, {
        polarity: 'lower-is-better',
        comparatorMethod: 'No comparison',
      }),
    ).toBe('none');
    expect(
      benchmarkJudgement(obs({ value: 90, lowerCi95: null, upperCi95: null }), 100, ciIndicator),
    ).toBe('none');
  });

  it('inverts better and worse when high is good', () => {
    const highGood = { ...ciIndicator, polarity: 'higher-is-better' as const };
    expect(
      benchmarkJudgement(obs({ value: 110, lowerCi95: 105, upperCi95: 115 }), 100, highGood),
    ).toBe('better');
    expect(
      benchmarkJudgement(obs({ value: 90, lowerCi95: 85, upperCi95: 95 }), 100, highGood),
    ).toBe('worse');
  });

  it('reports sides without judgement when neither direction is better', () => {
    const noPolarity = { polarity: 'no-polarity' as const, comparatorMethod: null };
    expect(benchmarkJudgement(obs({ value: 90 }), 100, noPolarity)).toBe('lower');
    expect(benchmarkJudgement(obs({ value: 110 }), 100, noPolarity)).toBe('higher');
    expect(benchmarkJudgement(obs({ value: 100 }), 100, noPolarity)).toBe('similar');
  });

  it('uses confidence intervals for a neutral indicator with a sanctioned comparator', () => {
    const neutral = { ...ciIndicator, polarity: 'no-polarity' as const };
    const observation = obs({
      value: 110,
      lowerCi95: 105,
      upperCi95: 115,
      lowerCi998: 95,
      upperCi998: 120,
    });
    expect(benchmarkJudgement(observation, 100, neutral, '95')).toBe('higher');
    expect(benchmarkJudgement(observation, 100, neutral, '99.8')).toBe('similar');
    expect(benchmarkJudgement(obs({ value: 90, lowerCi95: 85, upperCi95: 95 }), 100, neutral)).toBe(
      'lower',
    );
  });

  it('refuses to judge where no comparison is possible', () => {
    const observation = obs({ value: 90, lowerCi95: 85, upperCi95: 95 });
    expect(
      benchmarkJudgement(observation, 100, {
        polarity: 'no-comparison-possible',
        comparatorMethod: null,
      }),
    ).toBe('none');
  });
});

describe('inequality selection', () => {
  const deprivation = (name: string, period = ['2023-01-01', '2023-12-31']) =>
    obs({
      fromDate: period[0],
      toDate: period[1],
      dimensions: [dim('Deprivation deciles', name, { dimensionClass: 'inequality' })],
    });
  const ethnicity = obs({
    dimensions: [dim('Ethnic group', 'White', { dimensionClass: 'inequality' })],
  });
  const all = [
    // The headline series the reference segment comes from.
    obs({ dimensions: [] }),
    obs({ fromDate: '2022-01-01', toDate: '2022-12-31', dimensions: [] }),
    obs({ dimensions: [dim('Sex', 'Male')] }),
    ethnicity,
    deprivation('Most deprived'),
    deprivation('Least deprived'),
    deprivation('Most deprived', ['2022-01-01', '2022-12-31']),
  ];

  it('offers every inequality category the indicator reports', () => {
    expect(inequalityCategories(all)).toEqual(['Deprivation deciles', 'Ethnic group']);
  });

  it('offers the periods that category reports, oldest first', () => {
    expect(inequalityPeriods(all, 'Deprivation deciles').map((p) => p.label)).toEqual([
      '2022',
      '2023',
    ]);
  });

  it('breaks one category down for one period', () => {
    const rows = inequalityBreakdown(all, 'Deprivation deciles', '2023-01-01/2023-12-31');

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.dimensions[0]?.type === 'Deprivation deciles')).toBe(true);
  });

  it('keeps only the pure category rows, never sexed sub-breakdowns', () => {
    const sexedDecile = obs({
      dimensions: [
        dim('Deprivation deciles', 'Most deprived', { dimensionClass: 'inequality' }),
        dim('Sex', 'Male'),
      ],
    });

    const rows = inequalityBreakdown(
      [...all, sexedDecile],
      'Deprivation deciles',
      '2023-01-01/2023-12-31',
    );

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.dimensions.length === 1)).toBe(true);
  });

  it('lets the headline series baseline dimensions ride on category rows', () => {
    // QOF prevalence style: every observation carries Age 17+, deciles included.
    const aged = (dimensions: ReturnType<typeof dim>[], period = ['2023-01-01', '2023-12-31']) =>
      obs({
        fromDate: period[0],
        toDate: period[1],
        dimensions: [dim('Age', '17+ yrs'), ...dimensions],
      });
    const observations = [
      aged([]),
      aged([], ['2022-01-01', '2022-12-31']),
      aged([dim('Deprivation deciles', 'Most deprived', { dimensionClass: 'inequality' })]),
      aged([dim('Deprivation deciles', 'Least deprived', { dimensionClass: 'inequality' })]),
    ];

    expect(inequalityPeriods(observations, 'Deprivation deciles').map((p) => p.label)).toEqual([
      '2023',
    ]);
    expect(
      inequalityBreakdown(observations, 'Deprivation deciles', '2023-01-01/2023-12-31'),
    ).toHaveLength(2);
  });
});

describe('inequalityCategoryOptions', () => {
  it('uses the prototype wording for deprivation categories', () => {
    expect(
      inequalityCategoryLabel(
        'County & UA deprivation deciles in England (IMD2019, 4/23 geography)',
      ),
    ).toBe('Counties and unitary authorities by deprivation (IMD 2019, April 2023 boundaries)');
    expect(inequalityCategoryLabel('LSOA21 deprivation deciles within area (IMD trend)')).toBe(
      'LSOA21 deprivation deciles (IMD trend)',
    );
  });

  it('keeps each deprivation geography distinct in the category options', () => {
    const options = inequalityCategoryOptions([
      'County & UA deprivation deciles in England (IMD2019, 4/21 geography)',
      'County & UA deprivation deciles in England (IMD2019, 4/23 geography)',
      'District & UA deprivation deciles in England (IMD2025, 4/23 geography)',
    ]);

    expect(options.map(({ label }) => label)).toEqual([
      'Counties and unitary authorities by deprivation (IMD 2019, April 2021 boundaries)',
      'Counties and unitary authorities by deprivation (IMD 2019, April 2023 boundaries)',
      'Districts and unitary authorities by deprivation (IMD 2025, April 2023 boundaries)',
    ]);
  });
});

describe('inequalityValueLabel', () => {
  it.each([
    [
      'County & UA deprivation deciles in England (IMD2019, 4/23 geography)',
      1,
      'Decile 1 (most deprived, IMD 2019)',
    ],
    ['LSOA21 deprivation deciles within area (IMD2019)', 2, 'Decile 2 (IMD 2019)'],
    [
      'District & UA deprivation deciles in England (IMD2025, 4/23 geography)',
      10,
      'Decile 10 (least deprived, IMD 2025)',
    ],
  ])('labels the IMD year and deprivation rank for %s', (type, sortOrder, expected) => {
    expect(
      inequalityValueLabel(
        obs({
          dimensions: [dim(type, 'Original label', { dimensionClass: 'inequality', sortOrder })],
        }),
      ),
    ).toBe(expected);
  });

  it('preserves unrecognised labels even for long repeated category text', () => {
    expect(
      inequalityValueLabel(
        obs({
          dimensions: [
            dim('deprivation deciles'.repeat(2000), 'Original label', {
              dimensionClass: 'inequality',
              sortOrder: 1,
            }),
          ],
        }),
      ),
    ).toBe('Original label');
  });
});
