import { describe, expect, it } from 'vitest';

import { pagePath, pageSearch } from './page-url.ts';

describe('pageSearch', () => {
  it('keeps the page query of a data request and drops its route list', () => {
    const url = new URL(
      'https://example.test/indicator/42.data?as=E06000001&_routes=routes%2Findicator',
    );

    expect(pageSearch(url)).toBe('?as=E06000001');
  });

  it('is empty when the route list was the only parameter', () => {
    expect(pageSearch(new URL('https://example.test/indicator/42.data?_routes=root'))).toBe('');
  });

  it('is empty for a request with no query', () => {
    expect(pageSearch(new URL('https://example.test/indicator/42'))).toBe('');
  });
});

describe('pagePath', () => {
  it('is the path and query of a page request', () => {
    expect(pagePath(new URL('https://example.test/topics?page=2'))).toBe('/topics?page=2');
  });

  it('maps a data request back to its page, without the route list', () => {
    expect(pagePath(new URL('https://example.test/topics.data?page=2&_routes=root'))).toBe(
      '/topics?page=2',
    );
  });

  it("maps the root's data request back to the root", () => {
    expect(pagePath(new URL('https://example.test/_.data?_routes=root'))).toBe('/');
  });
});
