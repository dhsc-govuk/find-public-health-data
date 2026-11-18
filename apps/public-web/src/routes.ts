import { index, layout, type RouteConfig, route } from '@react-router/dev/routes';

import { withRouteIds } from '../../route-ids.ts';

export default withRouteIds([
  // The private beta's own pages, outside the gate that sends everyone else to them.
  route('private-beta', '../../../packages/public-web-features/src/private-beta/route.tsx'),
  route(
    'private-beta/sign-in',
    '../../../packages/public-web-features/src/private-beta/sign-in-route.ts',
  ),
  layout('./private-beta-gate.tsx', [
    index('../../../packages/public-web-features/src/home/route.tsx'),
    route('search', '../../../packages/public-web-features/src/search/route.tsx'),
    route('topics', '../../../packages/public-web-features/src/topic/list-route.tsx'),
    route('topics/:slug', '../../../packages/public-web-features/src/topic/route.tsx'),
    route(
      'topics/:slug/table.csv',
      '../../../packages/public-web-features/src/topic/table-csv-route.ts',
    ),
    route(
      'indicators/search',
      '../../../packages/public-web-features/src/indicator/search-route.ts',
    ),
    route('geographies', '../../../packages/public-web-features/src/indicator/geography-route.ts'),
    route(
      'compare-areas',
      '../../../packages/public-web-features/src/indicator/compare-areas-route.ts',
    ),
    route(
      'indicator/:slug/table.csv',
      '../../../packages/public-web-features/src/indicator/table-csv-route.ts',
      { id: 'single_indicator_table_csv' },
    ),
    route(
      'indicator/:slug/all-data.csv',
      '../../../packages/public-web-features/src/indicator/all-data-csv-route.ts',
      { id: 'single_indicator_all_data_csv' },
    ),
    route('indicator/:slug', '../../../packages/public-web-features/src/indicator/route.tsx', {
      id: 'indicator_detail',
    }),
    route(
      'indicator/:slug/metadata.txt',
      '../../../packages/public-web-features/src/indicator/metadata-route.ts',
    ),
    route('*', '../../../packages/ui/src/not-found-route.tsx'),
  ]),
]) satisfies RouteConfig;
