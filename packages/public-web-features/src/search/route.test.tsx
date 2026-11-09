// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { shouldRevalidate } from './route.tsx';

describe('shouldRevalidate', () => {
  it.each([true, false])(
    'preserves defaultShouldRevalidate=%s for the same URL',
    (defaultShouldRevalidate) => {
      const url = new URL('http://localhost/search?q=diabetes&tab-search=topics');
      expect(
        shouldRevalidate({
          currentUrl: url,
          nextUrl: new URL(url),
          currentParams: {},
          nextParams: {},
          defaultShouldRevalidate,
        }),
      ).toBe(defaultShouldRevalidate);
    },
  );

  it.each([
    ['', '&tab-search=topics'],
    ['&tab-search=topics', '&tab-search=indicators'],
    ['&tab-search=topics', ''],
  ])('skips revalidation when only the tab changes from %s to %s', (currentTab, nextTab) => {
    expect(
      shouldRevalidate({
        currentUrl: new URL(`http://localhost/search?q=diabetes${currentTab}`),
        nextUrl: new URL(`http://localhost/search?q=diabetes${nextTab}`),
        currentParams: {},
        nextParams: {},
        defaultShouldRevalidate: true,
      }),
    ).toBe(false);
  });

  it.each([true, false])(
    'preserves defaultShouldRevalidate=%s when the query changes',
    (defaultShouldRevalidate) => {
      expect(
        shouldRevalidate({
          currentUrl: new URL('http://localhost/search?q=diabetes'),
          nextUrl: new URL('http://localhost/search?q=mortality&tab-search=topics'),
          currentParams: {},
          nextParams: {},
          defaultShouldRevalidate,
        }),
      ).toBe(defaultShouldRevalidate);
    },
  );
});
