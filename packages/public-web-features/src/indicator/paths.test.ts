import { describe, expect, it } from 'vitest';

import { indicatorSelectionUrl, isIndicatorSegment, redirectStatus } from './paths.ts';

describe('indicatorSelectionUrl', () => {
  it('treats empty geography parameters and England as no picked areas', () => {
    const next = new URL(
      indicatorSelectionUrl(
        { pathname: '/indicator/example', search: '?as=&as=E92000001&als=' },
        ['E10000032'],
        [],
        108,
      ),
      'http://localhost',
    );
    expect(next.searchParams.getAll('cmp-108')).toEqual(['england']);
  });

  it.each([
    [['E10000032'], []],
    [[], ['Local authorities']],
  ])('checks England when picking the first geographies', (codes, levels) => {
    const next = new URL(
      indicatorSelectionUrl(
        { pathname: '/indicator/example', search: '?sex-108=Male' },
        codes,
        levels,
        108,
      ),
      'http://localhost',
    );
    expect(next.searchParams.getAll('cmp-108')).toEqual(['england']);
    expect(next.searchParams.get('sex-108')).toBe('Male');
  });

  it.each([
    '?cmp-108=',
    '?cmp-108=none',
    '?cmp-108=region',
    '?as=E10000032',
    '?als=Local+authorities',
  ])('preserves an existing choice or selection for %s', (search) => {
    const next = new URL(
      indicatorSelectionUrl({ pathname: '/indicator/example', search }, ['E08000003'], [], 108),
      'http://localhost',
    );
    expect(next.searchParams.getAll('cmp-108')).toEqual(
      new URLSearchParams(search).getAll('cmp-108'),
    );
  });

  it('does not check England when clearing geographies or change another indicator', () => {
    const location = { pathname: '/indicator/example', search: '?cmp-241=region' };
    expect(
      new URL(indicatorSelectionUrl(location, [], [], 108), 'http://localhost').searchParams.has(
        'cmp-108',
      ),
    ).toBe(false);
    const next = new URL(
      indicatorSelectionUrl(location, ['E10000032'], [], 108),
      'http://localhost',
    );
    expect(next.searchParams.get('cmp-241')).toBe('region');
    expect(next.searchParams.get('cmp-108')).toBe('england');
  });
});

describe('redirectStatus', () => {
  it.each(['108', 'Under-75-Mortality', 'UNDER-75-MORTALITY'])(
    '301s %s, an address that can never be canonical',
    (segment) => {
      expect(redirectStatus(segment, 'under-75-mortality')).toBe(301);
    },
  );

  it('302s a superseded slug, which the indicator may take back', () => {
    expect(redirectStatus('an-earlier-name', 'under-75-mortality')).toBe(302);
  });
});

describe('isIndicatorSegment', () => {
  it.each(['108', '2147483647', 'under-75-mortality', 'Under-75-Mortality'])(
    'accepts %s, a short id or a slug in any case',
    (segment) => {
      expect(isIndicatorSegment(segment)).toBe(true);
    },
  );

  it.each([
    '2147483648',
    '9999999999',
    '12345678901',
    '-leading',
    'trailing-',
    'two--hyphens',
    'a'.repeat(201),
    'no_such',
    'search',
    'facets',
    'Compare',
  ])('refuses %s without asking the API', (segment) => {
    expect(isIndicatorSegment(segment)).toBe(false);
  });
});
