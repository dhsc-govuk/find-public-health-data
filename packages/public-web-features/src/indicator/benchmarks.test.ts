import { describe, expect, it } from 'vitest';
import { benchmarkFixture } from './benchmark.testing.ts';
import {
  benchmarkCheckboxOptions,
  benchmarkRange,
  canonicalBenchmarks,
  deprivationType,
  selectedBenchmarks,
  setBenchmarkParams,
} from './benchmarks.ts';

describe('benchmark ranges', () => {
  it.each([
    ['E10000032', 'Upper-tier local authorities', 'upper'],
    ['E07000223', 'Lower-tier local authorities', 'lower'],
    ['E06000052', 'Upper-tier local authorities', 'upper'],
    ['E06000052', 'Lower-tier local authorities', 'lower'],
    ['E08000003', 'Lower-tier local authorities', 'lower'],
    ['E09000001', 'Upper-tier local authorities', 'upper'],
  ])('uses the public tier for %s at %s', (code, level, tier) => {
    const geography = {
      levelByCode: { [code]: level },
      regionByCode: { [code]: { code: 'E12000008', name: 'South East' } },
    };
    expect(benchmarkRange(geography, code, 'england')).toEqual({
      key: `england:${tier}`,
      query: `tier=${tier}`,
    });
    expect(benchmarkRange(geography, code, 'region')).toEqual({
      key: `region:E12000008:${tier}`,
      query: `tier=${tier}&parent=E12000008`,
    });
  });

  it.each([
    ['E54000026', 'Integrated care boards'],
    ['E12000008', 'Statistical regions'],
  ])('keeps the display-group ranges for %s', (code, level) => {
    const geography = {
      levelByCode: { [code]: level },
      regionByCode: { [code]: { code: 'E12000008', name: 'South East' } },
      tierByCode: { [code]: 'upper' as const },
    };
    expect(benchmarkRange(geography, code, 'england')).toEqual({
      key: level,
      query: `displayGroup=${encodeURIComponent(level)}`,
    });
    expect(benchmarkRange(geography, code, 'region')).toEqual({
      key: 'Statistical regions',
      query: 'displayGroup=Statistical%20regions',
    });
  });
});

describe('selectedBenchmarks', () => {
  it('deduplicates repeated parameters in canonical order', () => {
    expect(
      selectedBenchmarks(
        new URLSearchParams('cmp-108=region&cmp-108=england&cmp-108=region&cmp-241=goal'),
        108,
      ),
    ).toEqual(['england', 'region']);
  });

  it.each(['', 'cmp-108=', 'cmp-108=none', 'cmp-108=unknown'])(
    'selects no benchmarks for %s',
    (query) => {
      expect(selectedBenchmarks(new URLSearchParams(query), 108)).toEqual([]);
    },
  );

  it('accepts checked values alongside the no-JavaScript sentinel and old single links', () => {
    expect(selectedBenchmarks(new URLSearchParams('cmp-108=&cmp-108=region'), 108)).toEqual([
      'region',
    ]);
    expect(selectedBenchmarks(new URLSearchParams('cmp-compare=england'), 'compare')).toEqual([
      'england',
    ]);
  });

  it('reserves the later benchmark types in display order', () => {
    const choices = [
      'ca:E10000032',
      'neighbours:E10000032',
      'goal',
      'imd2025',
      'imd2019',
      'region',
      'england',
    ] as const;
    expect(
      selectedBenchmarks(new URLSearchParams(choices.map((choice) => ['cmp-108', choice])), 108),
    ).toEqual(canonicalBenchmarks(choices));
    expect(canonicalBenchmarks(choices)).toEqual([...choices].reverse());
  });
});

describe('setBenchmarkParams', () => {
  it('serialises distinct repeated values while preserving other options', () => {
    const params = new URLSearchParams('as=E10000032&cmp-108=none&cmp-241=region');
    setBenchmarkParams(params, 108, ['region', 'england', 'region']);
    expect(params.getAll('cmp-108')).toEqual(['england', 'region']);
    expect(selectedBenchmarks(params, 108)).toEqual(['england', 'region']);
    expect(params.get('as')).toBe('E10000032');
    expect(params.get('cmp-241')).toBe('region');
    setBenchmarkParams(params, 108, []);
    expect(params.has('cmp-108')).toBe(true);
    expect(params.getAll('cmp-108')).toEqual(['']);
    expect(selectedBenchmarks(params, 108)).toEqual([]);
  });
});

describe('benchmark options', () => {
  it('offers available options in checkbox order with picked area labels', () => {
    const { areaData, geography, detail } = benchmarkFixture();
    expect(
      benchmarkCheckboxOptions(true, {
        areas: areaData.slice(0, 2),
        geography,
        englandObservations: areaData[2]?.observations ?? [],
        goal: detail.goal,
      }).map(({ label }) => label),
    ).toEqual([
      'England',
      'Statistical regions',
      'Areas with similar deprivation to the selected area (Index of Multiple Deprivation (IMD) 2025)',
      'Areas with similar deprivation to the selected area (Index of Multiple Deprivation (IMD) 2019)',
      'Policy goal',
      'Statistical neighbours (Manchester)',
      'Statistical neighbours (Cornwall)',
      'Combined authority (Manchester)',
      'Combined authority (Cornwall)',
    ]);
  });

  it.each(['upper', 'lower'] as const)(
    'requires the matching %s tier and scheme as well as England decile observations',
    (tier) => {
      const fixture = benchmarkFixture();
      const firstMembership = fixture.geography.deprivation[0];
      if (!firstMembership) throw new Error('Missing membership');
      const membership = { ...firstMembership, tier, scheme: 'IMD2025' as const };
      const geography = {
        ...fixture.geography,
        deprivation: [membership],
        levelByCode: { E08000003: `${tier}-tier local authorities` },
      };
      const context = {
        areas: fixture.areaData.slice(0, 1),
        geography,
        englandObservations: [fixture.decileObservation(membership, 10)],
        goal: null,
      };
      const choices = () => benchmarkCheckboxOptions(false, context).map(({ value }) => value);
      expect(choices()).toContain('imd2025');
      expect(choices()).not.toContain('imd2019');
      context.geography.deprivation = [
        { ...membership, tier: tier === 'upper' ? 'lower' : 'upper' },
      ];
      expect(choices()).not.toContain('imd2025');
      context.geography.deprivation = [membership];
      context.englandObservations = [];
      expect(choices()).not.toContain('imd2025');
      expect(deprivationType(membership)).toContain(
        tier === 'upper' ? 'County & UA' : 'District & UA',
      );
    },
  );

  it('omits neighbours, CA and goal without their memberships and metadata', () => {
    const { area, areaData } = benchmarkFixture();
    expect(
      benchmarkCheckboxOptions(false, {
        areas: areaData.slice(0, 2),
        geography: { regionByCode: {}, levelByCode: {}, neighboursByCode: { E08000003: [] } },
        englandObservations: area('E92000001', 'England', 5).observations,
        goal: null,
      }),
    ).toEqual([{ value: 'england', label: 'England' }]);
  });

  it('leaves England out for an indicator without an England value', () => {
    const { areaData, geography } = benchmarkFixture();
    expect(
      benchmarkCheckboxOptions(true, {
        areas: areaData.slice(0, 2),
        geography,
        englandObservations: [],
        goal: null,
      }).map(({ value }) => value),
    ).not.toContain('england');
  });
});

it('offers no England benchmark when all England values are null', () => {
  const fixture = benchmarkFixture();
  const options = benchmarkCheckboxOptions(false, {
    areas: fixture.areaData,
    geography: fixture.geography,
    englandObservations: fixture.areaData
      .flatMap(({ observations }) => observations)
      .map((point) => ({ ...point, value: null })),
    goal: null,
  });
  expect(options.map(({ value }) => value)).not.toContain('england');
});

it('offers England only when the shown period type has a value', () => {
  const fixture = benchmarkFixture();
  const point = fixture.areaData.flatMap(({ observations }) => observations)[0];
  if (!point) throw new Error('Missing observation');
  const context = {
    areas: fixture.areaData,
    geography: fixture.geography,
    englandObservations: [
      { ...point, fromDate: '2024-01-01', toDate: '2024-12-31', value: null },
      { ...point, fromDate: '2022-01-01', toDate: '2024-12-31', value: 0 },
    ],
    goal: null,
  };
  for (const [periodType, offered] of [
    ['1-year', false],
    ['3-year', true],
  ] as const)
    expect(
      benchmarkCheckboxOptions(false, { ...context, periodType }).some(
        ({ value }) => value === 'england',
      ),
    ).toBe(offered);
});
