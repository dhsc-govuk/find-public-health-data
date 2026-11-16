import { index, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('../../../packages/public-web-features/src/home/route.tsx'),
  route('search', '../../../packages/public-web-features/src/search/route.tsx'),
  route('topics', '../../../packages/public-web-features/src/topic/list-route.tsx'),
  route('topics/:slug', '../../../packages/public-web-features/src/topic/route.tsx'),
  route(
    'topics/:slug/table.csv',
    '../../../packages/public-web-features/src/topic/table-csv-route.ts',
  ),
  route('indicators/search', '../../../packages/public-web-features/src/indicator/search-route.ts'),
  route('geographies', '../../../packages/public-web-features/src/indicator/geography-route.ts'),
  route(
    'compare-areas',
    '../../../packages/public-web-features/src/indicator/compare-areas-route.ts',
  ),
  route(
    'indicator/:slug/table.csv',
    '../../../packages/public-web-features/src/indicator/table-csv-route.ts',
    { id: 'single-indicator-table-csv' },
  ),
  route(
    'indicator/:slug/all-data.csv',
    '../../../packages/public-web-features/src/indicator/all-data-csv-route.ts',
    { id: 'single-indicator-all-data-csv' },
  ),
  route('indicator/:slug', '../../../packages/public-web-features/src/indicator/route.tsx', {
    id: 'indicator-detail',
  }),
  route(
    'indicator/:slug/metadata.txt',
    '../../../packages/public-web-features/src/indicator/metadata-route.ts',
  ),
  route('*', '../../../packages/ui/src/not-found-route.tsx'),
] satisfies RouteConfig;
