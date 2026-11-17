import { describe, expect, it } from 'vitest';
import { canonicalBenchmarks, selectedBenchmarks, setBenchmarkParams } from './benchmarks.ts';

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
