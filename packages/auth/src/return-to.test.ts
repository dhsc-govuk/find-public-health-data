import { describe, expect, it } from 'vitest';

import { decodeReturnTo, encodeReturnTo, normalizeReturnTo } from './return-to.ts';

describe('normalizeReturnTo', () => {
  it('retains local paths, query strings and fragments', () => {
    expect(normalizeReturnTo('/manage?view=drafts#latest')).toBe('/manage?view=drafts#latest');
  });

  it.each([
    'https://example.com',
    '//example.com/path',
    '/..//example.com/path',
    '/.//example.com/path',
    '',
    undefined,
    null,
  ])('rejects an external or invalid target', (target) => {
    expect(normalizeReturnTo(target, '/fallback')).toBe('/fallback');
  });
});

describe('encodeReturnTo', () => {
  it('writes the address as lower-case hex', () => {
    expect(encodeReturnTo('/topics?page=1')).toBe('2f746f706963733f706167653d31');
  });

  it('leaves no character the gateway counts in a filtered search address', () => {
    const encoded = encodeReturnTo(
      '/search?q=smoking&t=smoking-and-tobacco&t=mental-health&ls=working-age-adults',
    );

    expect(encoded).toMatch(/^[0-9a-f]+$/);
  });
});

describe('decodeReturnTo', () => {
  it.each([
    '/',
    '/topics?page=1',
    '/search?q=caf%C3%A9&t=mental-health-and-wellbeing#results',
    '/search?q=café',
  ])('gives back the address encodeReturnTo wrote: %s', (path) => {
    expect(decodeReturnTo(encodeReturnTo(path))).toBe(normalizeReturnTo(path));
  });

  it('reads upper-case hex', () => {
    expect(decodeReturnTo('2F746F70696373')).toBe('/topics');
  });

  it.each([
    ['an external address', encodeReturnTo('https://example.com')],
    ['a protocol-relative address', encodeReturnTo('//example.com/path')],
    ['a dot-segment escape', encodeReturnTo('/..//example.com/path')],
    ['an unencoded path', '/topics'],
    ['an odd number of digits', '2f7'],
    ['characters that are not hex', '2g'],
    ['bytes that are not UTF-8', 'ff'],
    ['an empty value', ''],
    ['no value', null],
  ])('falls back for %s', (_, value) => {
    expect(decodeReturnTo(value, '/fallback')).toBe('/fallback');
  });
});
