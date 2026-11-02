export const DASHBOARD_PATH = '/dashboard';

/** The tab, for a user offered several, that holds the indicators they create and edit. */
export const CREATE_AND_EDIT_TAB = 'create-and-edit';

/** The tab, for a user offered several who may not create, that holds every indicator. */
export const ALL_INDICATORS_TAB = 'all-indicators';

/**
 * The first page is the bare path, so the canonical address has no query string. A tab, when
 * given, keeps a user offered several on the one they paged in.
 */
export function dashboardPath(page: number, tab?: string): string {
  const query = new URLSearchParams();
  if (page !== 1) query.set('page', String(page));
  if (tab !== undefined) query.set('tab', tab);
  const search = query.toString();
  return search === '' ? DASHBOARD_PATH : `${DASHBOARD_PATH}?${search}`;
}
