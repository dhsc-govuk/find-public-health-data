import { callsScan } from './scans.ts';

/**
 * Page routes, as `react-router routes` reports them, to the spec covering them. The mapping is
 * spelt out rather than derived from the path so a new route is a deliberate entry here and a
 * spec to match, and so a group of routes making one journey can share a spec. Both apps use
 * the one table: a route is looked up under the spec directory of whichever app declares it, or
 * of another app that mounts the same module at the same path, since shared behaviour is tested
 * once. Resource routes need no entry; one that has an entry, such as a redirect worth a journey
 * test, exempts its spec from scanning.
 */
export const PAGE_SPECS: Readonly<Record<string, string>> = {
  '/': 'home.spec.ts',
  '/sign-in': 'sign-in.spec.ts',
  '/access-denied': 'access-denied.spec.ts',
  '/search': 'search.spec.ts',
  '/topics': 'topics.spec.ts',
  '/topics/:slug': 'topic.spec.ts',
  '/indicator/:slug': 'indicator.spec.ts',
  '/dashboard': 'dashboard.spec.ts',
  '/dashboard/indicators/:id': 'indicator-overview.spec.ts',
  '/dashboard/indicators/:id/assign-reviewers': 'indicator-reviewer-assignment.spec.ts',
  '/publish/indicators/new/team': 'indicator-team.spec.ts',
  '/publish/indicators/new': 'indicator-name.spec.ts',
  '/publish/indicators/:id/name': 'indicator-name.spec.ts',
  '/publish/indicators/:id/task-list': 'indicator-task-list.spec.ts',
  '/publish/indicators/:id/withdraw-submission': 'indicator-submission.spec.ts',
  '/publish/indicators/:id/data-table': 'indicator-data-table.spec.ts',
  '/publish/indicators/:id/data-table/problems': 'indicator-data-table.spec.ts',
  '/publish/indicators/:id/data-table/check': 'indicator-data-table-check.spec.ts',
  '/publish/indicators/:id/definition-and-rationale': 'indicator-definition-and-rationale.spec.ts',
  '/publish/indicators/:id/polarity': 'indicator-polarity.spec.ts',
  '/publish/indicators/:id/data-quality': 'indicator-data-quality.spec.ts',
  '/publish/indicators/:id/numerator': 'indicator-numerator-denominator.spec.ts',
  '/publish/indicators/:id/denominator': 'indicator-numerator-denominator.spec.ts',
  '/publish/indicators/:id/calculation': 'indicator-calculation.spec.ts',
  '/publish/indicators/:id/confidence-intervals': 'indicator-confidence-intervals.spec.ts',
  '/publish/indicators/:id/update-frequency': 'indicator-update-frequency.spec.ts',
  '/publish/indicators/:id/period-type': 'indicator-period-type.spec.ts',
  '/publish/indicators/:id/value-type-and-units': 'indicator-value-type-and-units.spec.ts',
  '/publish/indicators/:id/other-notes-and-caveats': 'indicator-yes-no-sections.spec.ts',
  '/publish/indicators/:id/publishing-date': 'indicator-publishing-date.spec.ts',
  '/publish/indicators/:id/links': 'indicator-links.spec.ts',
  '/publish/indicators/:id/variance-and-quality': 'indicator-yes-no-sections.spec.ts',
  '/publish/indicators/:id/justifications': 'indicator-yes-no-sections.spec.ts',
  '/publish/indicators/:id/other-comments': 'indicator-yes-no-sections.spec.ts',
  '/publish/indicators/:id/copyright-and-data-reuse': 'indicator-yes-no-sections.spec.ts',
  '/publish/indicators/:id/benchmarking': 'indicator-benchmarking.spec.ts',
  '/publish/indicators/:id/sex-and-ages': 'indicator-sex-and-ages.spec.ts',
  '/publish/indicators/:id/tagging': 'indicator-tagging.spec.ts',
  '/manage': 'manage.spec.ts',
  '/manage/topics': 'manage-topics.spec.ts',
  '/manage/topics/new': 'manage-topics.spec.ts',
  '/manage/topics/:id': 'manage-topics.spec.ts',
  '/manage/topics/:id/delete': 'manage-topics.spec.ts',
  '/*': 'not-found.spec.ts',
};

/** One app's route, classified by whether its module renders a page. */
export type ClassifiedRoute = {
  path: string;
  /** The route module, relative to the repository root, so two apps' routes compare. */
  module: string;
  page: boolean;
};

/** One app's routes and its specs, relative to the app's spec directory. */
export type AppSpecs = {
  routes: readonly ClassifiedRoute[];
  specs: readonly string[];
};

export type Finding = {
  route: string;
  problem: string;
};

/**
 * Each of one app's page routes must map to a spec that exists among the app's specs, or among
 * the specs of one of `others` that mounts the same module at the same path. A resource route
 * needs no entry, but one it has must exist too: that entry is what exempts the spec from
 * scanning.
 */
export function findUncoveredRoutes(
  app: AppSpecs,
  others: readonly AppSpecs[] = [],
  mapping: Readonly<Record<string, string>> = PAGE_SPECS,
): Finding[] {
  const covers = (candidate: AppSpecs, route: ClassifiedRoute, spec: string) =>
    candidate.specs.includes(spec) &&
    candidate.routes.some(({ path, module }) => path === route.path && module === route.module);

  return app.routes.flatMap((route) => {
    const spec = mapping[route.path];
    if (spec === undefined) {
      return route.page ? [{ route: route.path, problem: 'is mapped to no spec' }] : [];
    }
    if (![app, ...others].some((candidate) => covers(candidate, route, spec))) {
      return [{ route: route.path, problem: `is mapped to ${spec}, which does not exist` }];
    }
    return [];
  });
}

/**
 * Mapping entries no app declares any more. A stale entry is harmless today but stops the table
 * being the record of which route each spec covers.
 */
export function findStaleEntries(
  routes: readonly string[],
  mapping: Readonly<Record<string, string>> = PAGE_SPECS,
): string[] {
  const declared = new Set(routes);
  return Object.keys(mapping).filter((route) => !declared.has(route));
}

/**
 * Specs that never scan for accessibility violations, by name. A spec that only resource routes
 * map to has no page to scan and is exempt; every other spec, mapped or not, drives some page
 * state.
 */
export function findSpecsWithoutScan(
  specs: ReadonlyArray<{ name: string; source: string }>,
  routes: readonly ClassifiedRoute[],
  mapping: Readonly<Record<string, string>> = PAGE_SPECS,
): string[] {
  const pageSpecs = new Set<string>();
  const resourceSpecs = new Set<string>();
  for (const { path, page } of routes) {
    const spec = mapping[path];
    if (spec !== undefined) (page ? pageSpecs : resourceSpecs).add(spec);
  }
  return specs
    .filter(({ name }) => pageSpecs.has(name) || !resourceSpecs.has(name))
    .filter(({ source }) => !callsScan(source))
    .map(({ name }) => name);
}
