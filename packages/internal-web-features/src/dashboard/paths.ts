export const DASHBOARD_PATH = '/dashboard';

/** The tab, for a user offered several, that holds the indicators they create and edit. */
export const CREATE_AND_EDIT_TAB = 'create-and-edit';

/** The tab, for a user offered several who may not create, that holds every indicator. */
export const ALL_INDICATORS_TAB = 'all-indicators';

/** The publisher's tab that holds their teams' indicators. */
export const YOUR_TEAMS_TAB = 'your-teams';

/** The publisher's tab that holds every other team's indicators. */
export const ALL_OTHER_TAB = 'all-other';

/** The query parameter of a list's page: `page`, or `otherPage` for other teams' indicators. */
export type DashboardPageKey = 'page' | 'otherPage';

/** The page each list is on, by its query parameter; a list left out is on its first page. */
export type DashboardPages = Partial<Record<DashboardPageKey, number>>;

/**
 * The first page of every list is the bare path, so the canonical address has no query string.
 * A tab, when given, keeps a user offered several on the one they paged in, and a search keeps
 * the lists narrowed to its matches.
 */
export function dashboardPath(pages: DashboardPages, tab?: string, search?: string): string {
  const query = new URLSearchParams();
  if (search !== undefined) query.set('search', search);
  for (const key of ['page', 'otherPage'] as const) {
    const page = pages[key];
    if (page !== undefined && page !== 1) query.set(key, String(page));
  }
  if (tab !== undefined) query.set('tab', tab);
  const queryString = query.toString();
  return queryString === '' ? DASHBOARD_PATH : `${DASHBOARD_PATH}?${queryString}`;
}
