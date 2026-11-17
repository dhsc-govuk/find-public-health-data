import { describe, expect, it } from 'vitest';
import { benchmarkFixture } from './benchmark.testing.ts';
import {
  benchmarkCheckboxOptions,
  canonicalBenchmarks,
  deprivationType,
  selectedBenchmarks,
  setBenchmarkParams,
} from './benchmarks.ts';

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
      'goal',
      'ca:E10000032',
      'neighbours:E10000032',
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
      'Statistical neighbours (Manchester)',
      'Statistical neighbours (Cornwall)',
      'Combined authority (Manchester)',
      'Combined authority (Cornwall)',
      'Policy goal',
    ]);
  });

  it.each(['upper', 'lower'] as const)(
    'requires the matching %s tier and scheme as well as England decile observations',
    (tier) => {
      const fixture = benchmarkFixture();
      const firstMembership = fixture.memberships[0];
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
    const { areaData } = benchmarkFixture();
    expect(
      benchmarkCheckboxOptions(false, {
        areas: areaData.slice(0, 2),
        geography: { regionByCode: {}, levelByCode: {}, neighboursByCode: { E08000003: [] } },
        englandObservations: [],
        goal: null,
      }),
    ).toEqual([{ value: 'england', label: 'England' }]);
  });
});
