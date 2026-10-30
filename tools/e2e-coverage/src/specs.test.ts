import { describe, expect, it } from 'vitest';

import {
  type ClassifiedRoute,
  findSpecsWithoutScan,
  findStaleEntries,
  findUncoveredRoutes,
} from './specs.ts';

const mapping = {
  '/': 'home.spec.ts',
  '/topics/:slug': 'topic.spec.ts',
  '/manage/topics': 'manage-topics.spec.ts',
  '/manage/topics/new': 'manage-topics.spec.ts',
};
const page = (path: string, module = `apps/public-web/src${path}.tsx`) => ({
  path,
  module,
  page: true,
});
const resource = (path: string) => ({ path, module: `apps/public-web/src${path}.ts`, page: false });
const app = (routes: ClassifiedRoute[], specs: string[]) => ({ routes, specs });

describe('findUncoveredRoutes', () => {
  it('passes page routes whose mapped spec exists and ignores resource routes', () => {
    expect(
      findUncoveredRoutes(
        app(
          [page('/'), page('/topics/:slug'), resource('/geographies')],
          ['home.spec.ts', 'topic.spec.ts'],
        ),
        [],
        mapping,
      ),
    ).toEqual([]);
  });

  it('names a page route no spec is mapped to', () => {
    expect(findUncoveredRoutes(app([page('/dashboard')], ['home.spec.ts']), [], mapping)).toEqual([
      { route: '/dashboard', problem: 'is mapped to no spec' },
    ]);
  });

  it('names a page route whose mapped spec does not exist', () => {
    expect(
      findUncoveredRoutes(app([page('/topics/:slug')], ['home.spec.ts']), [], mapping),
    ).toEqual([
      { route: '/topics/:slug', problem: 'is mapped to topic.spec.ts, which does not exist' },
    ]);
  });

  it('requires the spec a resource route is mapped to, since it exempts that spec from scanning', () => {
    expect(findUncoveredRoutes(app([resource('/')], ['topic.spec.ts']), [], mapping)).toEqual([
      { route: '/', problem: 'is mapped to home.spec.ts, which does not exist' },
    ]);
  });

  it('lets several routes share one spec', () => {
    expect(
      findUncoveredRoutes(
        app([page('/manage/topics'), page('/manage/topics/new')], ['manage-topics.spec.ts']),
        [],
        mapping,
      ),
    ).toEqual([]);
  });

  it("passes a route another app's spec covers when that app mounts the same module at the same path", () => {
    const shared = page('/topics/:slug', 'packages/public-web-features/src/topic/route.tsx');

    expect(
      findUncoveredRoutes(
        app([shared], ['home.spec.ts']),
        [app([shared], ['topic.spec.ts'])],
        mapping,
      ),
    ).toEqual([]);
  });

  it('names a route whose spec only another app has, when that app mounts a different module', () => {
    const internal = page('/topics/:slug', 'apps/internal-web/src/topic.tsx');
    const other = app([page('/topics/:slug', 'apps/public-web/src/topic.tsx')], ['topic.spec.ts']);

    expect(findUncoveredRoutes(app([internal], []), [other], mapping)).toEqual([
      { route: '/topics/:slug', problem: 'is mapped to topic.spec.ts, which does not exist' },
    ]);
  });

  it('names a route whose module another app mounts at a different path', () => {
    const module = 'packages/public-web-features/src/topic/route.tsx';
    const other = app([page('/', module)], ['topic.spec.ts']);

    expect(findUncoveredRoutes(app([page('/topics/:slug', module)], []), [other], mapping)).toEqual(
      [{ route: '/topics/:slug', problem: 'is mapped to topic.spec.ts, which does not exist' }],
    );
  });
});

describe('findStaleEntries', () => {
  it('names mapped routes no app declares', () => {
    expect(findStaleEntries(['/', '/topics/:slug'], mapping)).toEqual([
      '/manage/topics',
      '/manage/topics/new',
    ]);
  });

  it('is empty when every entry is declared', () => {
    expect(findStaleEntries(Object.keys(mapping), mapping)).toEqual([]);
  });
});

describe('findSpecsWithoutScan', () => {
  const scanned = {
    name: 'home.spec.ts',
    source: 'await expectNoAccessibilityViolations(page, testInfo);',
  };
  const unscanned = { name: 'home.spec.ts', source: "test('redirects', async () => {});" };

  it('names a spec that never calls the scan, even one that only mentions it', () => {
    expect(
      findSpecsWithoutScan(
        [
          scanned,
          {
            name: 'imported.spec.ts',
            source:
              "import { expectNoAccessibilityViolations } from '../support/accessibility.ts';",
          },
          {
            name: 'commented.spec.ts',
            source: '// expectNoAccessibilityViolations(page, testInfo)',
          },
          { name: 'bare.spec.ts', source: "test('renders', async () => {});" },
        ],
        [page('/')],
        mapping,
      ),
    ).toEqual(['imported.spec.ts', 'commented.spec.ts', 'bare.spec.ts']);
  });

  it('exempts a spec only resource routes map to', () => {
    expect(findSpecsWithoutScan([unscanned], [resource('/')], mapping)).toEqual([]);
  });

  it('holds a spec to the scan when any page route maps to it', () => {
    expect(findSpecsWithoutScan([unscanned], [resource('/'), page('/')], mapping)).toEqual([
      'home.spec.ts',
    ]);
  });

  it('holds a spec nothing maps to, since it drives some page state', () => {
    expect(findSpecsWithoutScan([{ ...unscanned, name: 'extra.spec.ts' }], [], mapping)).toEqual([
      'extra.spec.ts',
    ]);
  });
});
