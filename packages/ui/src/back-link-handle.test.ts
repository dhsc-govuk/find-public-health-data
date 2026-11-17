import type { UIMatch } from 'react-router';
import { describe, expect, it } from 'vitest';

import { backLinkFrom, backLinkHandle } from './back-link-handle.ts';

function match(overrides: Partial<UIMatch>): UIMatch {
  return {
    id: 'route',
    pathname: '/',
    params: {},
    loaderData: undefined,
    handle: undefined,
    ...overrides,
  };
}

const root = match({ id: 'root' });

describe('backLinkFrom', () => {
  it('finds nothing when no route declares a back link', () => {
    expect(backLinkFrom([root, match({ id: 'leaf', handle: { other: true } })])).toBeUndefined();
  });

  it('takes a fixed back link as declared', () => {
    const handle = backLinkHandle('/dashboard');

    expect(backLinkFrom([root, match({ id: 'leaf', handle })])).toEqual({
      href: '/dashboard',
      text: undefined,
    });
  });

  it('derives a back link from the loader data', () => {
    const handle = backLinkHandle<{ id: string }>((data) => `/dashboard/indicators/${data.id}`);

    expect(backLinkFrom([root, match({ id: 'leaf', handle, loaderData: { id: 'abc' } })])).toEqual({
      href: '/dashboard/indicators/abc',
      text: undefined,
    });
  });

  it('derives the text from the loader data, for a route reached from more than one page', () => {
    const handle = backLinkHandle<{ from: string }>(
      (data) => `/${data.from}`,
      (data) => `Back to ${data.from}`,
    );

    expect(
      backLinkFrom([root, match({ id: 'leaf', handle, loaderData: { from: 'task-list' } })]),
    ).toEqual({ href: '/task-list', text: 'Back to task-list' });
    expect(backLinkFrom([root, match({ id: 'leaf', handle })])).toBeUndefined();
  });

  it('leaves a data-derived back link out when the loader did not run', () => {
    const handle = backLinkHandle<{ id: string }>((data) => data.id);

    expect(backLinkFrom([root, match({ id: 'leaf', handle })])).toBeUndefined();
  });

  it('prefers the deepest route that declares one', () => {
    const parent = match({ id: 'parent', handle: backLinkHandle('/a') });
    const leaf = match({ id: 'leaf', handle: backLinkHandle('/b') });

    expect(backLinkFrom([root, parent, leaf])?.href).toBe('/b');
    expect(backLinkFrom([root, parent, match({ id: 'plain' })])?.href).toBe('/a');
  });

  it('carries the text the route named its destination with', () => {
    const handle = backLinkHandle('/dashboard', 'Back to indicators');

    expect(backLinkFrom([root, match({ id: 'leaf', handle })])).toEqual({
      href: '/dashboard',
      text: 'Back to indicators',
    });
  });
});
