import { createHash } from 'node:crypto';

import { DATA_TABLE_DRAFT } from './fixtures.ts';

export type App = 'public-web' | 'internal-web' | 'public-api' | 'internal-api';

export type Route = {
  app: App;
  /** Path and query, against the seeded data. */
  path: string;
  /** A median slower than this fails the route: 5–10 times CI's usual median (see the README). */
  limitMs: number;
  /**
   * Who an internal route is requested as: the admin for admin pages and for the seeded indicators,
   * which are in Fingertips and so hidden from publishers, otherwise the publisher.
   */
  as?: 'admin';
};

export const ORIGINS: Record<App, string> = {
  'public-web': process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000',
  'internal-web': process.env.INTERNAL_WEB_URL ?? 'http://localhost:3001',
  'public-api': process.env.PUBLIC_API_URL ?? 'http://localhost:4000',
  'internal-api': process.env.INTERNAL_API_URL ?? 'http://localhost:4001',
};

/** The key a route's work is recorded under in the baseline. */
export function routeKey(route: Route): string {
  return `${route.app} ${route.path}`;
}

const GP_PRACTICES = 'displayGroup=GP%20practices';
// Diabetes QOF prevalence: GP-level data, the largest indicator in the seed.
const DIABETES = { shortId: 241, id: '01a00ab4-ce0a-70c1-b22b-f8192c94a59d' };
const DIABETES_SLUG = 'diabetes-qof-prevalence';
const MORTALITY_SLUG = 'under-75-mortality-rate-from-all-causes';
const AREAS = ['E92000001', 'E08000003', 'E07000223', 'E07000032', 'E06000047'];
const DATA_TABLE = `/api/internal/indicators/${DATA_TABLE_DRAFT.indicatorId}/data-table`;
// The deepest page the API counts from the start: the last page that starts in the first half.
const DEEPEST_DATA_TABLE_PAGE = `page=${Math.floor(DATA_TABLE_DRAFT.rowCount / 2 / 50) + 1}&rowsPerPage=50`;
// The filter for Female, which half the rows match: its column and the start of the value's hash.
const FEMALE = `f=sex.${createHash('md5').update('Female').digest('hex').slice(0, 10)}`;
// The filter's deepest page, as the one above is for the whole table.
const DEEPEST_FEMALE_PAGE = `page=${Math.floor(DATA_TABLE_DRAFT.rowCount / 4 / 50) + 1}&rowsPerPage=50&${FEMALE}`;

/**
 * Read-only GETs over the seeded data, and the draft data table the fixture adds: the common pages
 * and the heaviest queries behind them.
 */
export const ROUTES: Route[] = [
  { app: 'public-web', path: '/', limitMs: 500 },
  { app: 'public-web', path: '/search?q=mortality', limitMs: 500 },
  { app: 'public-web', path: '/topics', limitMs: 500 },
  { app: 'public-web', path: '/topics/diabetes', limitMs: 500 },
  { app: 'public-web', path: '/topics/diabetes?ga=E10000032', limitMs: 500 },
  { app: 'public-web', path: '/topics/mortality-and-life-expectancy?tab-topic=data', limitMs: 500 },
  {
    app: 'public-web',
    path: '/topics/mortality-and-life-expectancy?tab-topic=areas',
    limitMs: 1000,
  },
  {
    app: 'public-web',
    path: '/topics/mortality-and-life-expectancy?tab-topic=data&sort=trend-desc',
    limitMs: 500,
  },
  {
    app: 'public-web',
    path: '/topics/mortality-and-life-expectancy?tab-topic=data&sort=period-desc',
    limitMs: 500,
  },
  {
    app: 'public-web',
    path: '/topics/mortality-and-life-expectancy/table.csv?tab-topic=areas',
    limitMs: 1000,
  },
  {
    app: 'public-web',
    path: `/indicator/${DIABETES_SLUG}?tab-indicator=compare&find=mortality`,
    limitMs: 500,
  },
  { app: 'public-web', path: `/indicator/${DIABETES_SLUG}`, limitMs: 500 },
  {
    app: 'public-web',
    path: `/indicator/${DIABETES_SLUG}?tab-indicator=compare&compareWith=92443&as=E07000223&as=E07000032`,
    limitMs: 1000,
  },
  { app: 'public-web', path: `/indicator/${DIABETES_SLUG}/table.csv`, limitMs: 1000 },
  { app: 'public-web', path: `/indicator/${MORTALITY_SLUG}/all-data.csv`, limitMs: 1000 },

  { app: 'internal-web', path: '/dashboard', limitMs: 500, as: 'admin' },
  { app: 'internal-web', path: `/dashboard/indicators/${DIABETES.id}`, limitMs: 500, as: 'admin' },
  { app: 'internal-web', path: '/manage/topics', limitMs: 500, as: 'admin' },
  {
    app: 'internal-web',
    path: `/publish/indicators/${DATA_TABLE_DRAFT.indicatorId}/data-table/check`,
    limitMs: 500,
  },
  {
    app: 'internal-web',
    path: `/publish/indicators/${DATA_TABLE_DRAFT.indicatorId}/data-table/check?${FEMALE}`,
    limitMs: 500,
  },
  {
    app: 'internal-web',
    path: '/topics/mortality-and-life-expectancy?tab-topic=data',
    limitMs: 500,
  },
  {
    app: 'internal-web',
    path: '/topics/mortality-and-life-expectancy?tab-topic=areas',
    limitMs: 1000,
  },

  { app: 'public-api', path: '/api/topics', limitMs: 250 },
  { app: 'public-api', path: '/api/indicators?q=mortality', limitMs: 250 },
  { app: 'public-api', path: '/api/indicators/search?q=diabetes', limitMs: 250 },
  {
    app: 'public-api',
    path: '/api/indicators/search?t=mortality-and-life-expectancy&page=1&sort=trend-desc',
    limitMs: 250,
  },
  { app: 'public-api', path: `/api/indicators/${DIABETES.shortId}`, limitMs: 250 },
  {
    app: 'public-api',
    path: `/api/indicators/${DIABETES.shortId}/data?${AREAS.map((code) => `areaCode=${code}`).join('&')}`,
    limitMs: 250,
  },
  {
    app: 'public-api',
    path: `/api/indicators/${DIABETES.shortId}/range?${GP_PRACTICES}`,
    limitMs: 250,
  },
  { app: 'public-api', path: `/api/areas?${GP_PRACTICES}`, limitMs: 250 },
  { app: 'public-api', path: '/api/areas/search?q=leeds', limitMs: 250 },

  { app: 'internal-api', path: '/api/internal/indicators', limitMs: 250, as: 'admin' },
  {
    app: 'internal-api',
    path: `/api/internal/indicators/${DIABETES.id}`,
    limitMs: 250,
    as: 'admin',
  },
  { app: 'internal-api', path: '/api/internal/topics', limitMs: 250, as: 'admin' },
  { app: 'internal-api', path: DATA_TABLE, limitMs: 250 },
  { app: 'internal-api', path: `${DATA_TABLE}?${DEEPEST_DATA_TABLE_PAGE}`, limitMs: 250 },
  { app: 'internal-api', path: `${DATA_TABLE}?${DEEPEST_FEMALE_PAGE}`, limitMs: 250 },
];
