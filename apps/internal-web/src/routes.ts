import { index, layout, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('./home.tsx'),
  route('sign-in', './sign-in.tsx'),
  route('access-denied', './access-denied.tsx'),
  layout('./authenticated.tsx', [
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
    layout('./dashboard.tsx', [
      route('dashboard', '../../../packages/internal-web-features/src/dashboard/route.tsx'),
      route(
        'dashboard/indicators/:id',
        '../../../packages/internal-web-features/src/indicator-overview/route.tsx',
      ),
      route(
        'dashboard/indicators/:id/assign-reviewers',
        '../../../packages/internal-web-features/src/indicator-reviewer-assignment/route.tsx',
      ),
    ]),
    layout('./publisher.tsx', [
      route(
        'publish/indicators/new/team',
        '../../../packages/internal-web-features/src/indicator-team/route.tsx',
      ),
      route(
        'publish/indicators/new',
        '../../../packages/internal-web-features/src/indicator-name/new-route.tsx',
      ),
      route(
        'publish/indicators/:id/name',
        '../../../packages/internal-web-features/src/indicator-name/edit-route.tsx',
      ),
      route(
        'publish/indicators/:id/task-list',
        '../../../packages/internal-web-features/src/indicator-task-list/route.tsx',
      ),
      route(
        'publish/indicators/:id/sample-answers',
        '../../../packages/internal-web-features/src/indicator-sample-answers/route.ts',
      ),
      route(
        'publish/indicators/:id/withdraw-submission',
        '../../../packages/internal-web-features/src/indicator-withdrawal/route.tsx',
      ),
      route(
        'publish/indicators/:id/data-table',
        '../../../packages/internal-web-features/src/indicator-data-table/upload-route.tsx',
      ),
      route(
        'publish/indicators/:id/data-table/problems',
        '../../../packages/internal-web-features/src/indicator-data-table/problems-route.tsx',
      ),
      route(
        'publish/indicators/:id/data-table/check',
        '../../../packages/internal-web-features/src/indicator-data-table/check-route.tsx',
      ),
      route(
        'publish/indicators/:id/definition-and-rationale',
        '../../../packages/internal-web-features/src/indicator-definition-and-rationale/route.tsx',
      ),
      route(
        'publish/indicators/:id/polarity',
        '../../../packages/internal-web-features/src/indicator-polarity/route.tsx',
      ),
      route(
        'publish/indicators/:id/data-quality',
        '../../../packages/internal-web-features/src/indicator-data-quality/route.tsx',
      ),
      route(
        'publish/indicators/:id/numerator',
        '../../../packages/internal-web-features/src/indicator-numerator-denominator/numerator-route.tsx',
      ),
      route(
        'publish/indicators/:id/denominator',
        '../../../packages/internal-web-features/src/indicator-numerator-denominator/denominator-route.tsx',
      ),
      route(
        'publish/indicators/:id/calculation',
        '../../../packages/internal-web-features/src/indicator-calculation/route.tsx',
      ),
      route(
        'publish/indicators/:id/confidence-intervals',
        '../../../packages/internal-web-features/src/indicator-confidence-intervals/route.tsx',
      ),
      route(
        'publish/indicators/:id/update-frequency',
        '../../../packages/internal-web-features/src/indicator-update-frequency/route.tsx',
      ),
      route(
        'publish/indicators/:id/period-type',
        '../../../packages/internal-web-features/src/indicator-period-type/route.tsx',
      ),
      route(
        'publish/indicators/:id/value-type-and-units',
        '../../../packages/internal-web-features/src/indicator-value-type-and-units/route.tsx',
      ),
      route(
        'publish/indicators/:id/other-notes-and-caveats',
        '../../../packages/internal-web-features/src/indicator-other-notes-and-caveats/route.tsx',
      ),
      route(
        'publish/indicators/:id/publishing-date',
        '../../../packages/internal-web-features/src/indicator-publishing-date/route.tsx',
      ),
      route(
        'publish/indicators/:id/links',
        '../../../packages/internal-web-features/src/indicator-links/route.tsx',
      ),
      route(
        'publish/indicators/:id/variance-and-quality',
        '../../../packages/internal-web-features/src/indicator-variance-and-quality/route.tsx',
      ),
      route(
        'publish/indicators/:id/justifications',
        '../../../packages/internal-web-features/src/indicator-justifications/route.tsx',
      ),
      route(
        'publish/indicators/:id/other-comments',
        '../../../packages/internal-web-features/src/indicator-other-comments/route.tsx',
      ),
      route(
        'publish/indicators/:id/copyright-and-data-reuse',
        '../../../packages/internal-web-features/src/indicator-copyright-and-data-reuse/route.tsx',
      ),
      route(
        'publish/indicators/:id/benchmarking',
        '../../../packages/internal-web-features/src/indicator-benchmarking/route.tsx',
      ),
      route(
        'publish/indicators/:id/sex-and-ages',
        '../../../packages/internal-web-features/src/indicator-sex-and-ages/route.tsx',
      ),
      route(
        'publish/indicators/:id/tagging',
        '../../../packages/internal-web-features/src/indicator-tagging/route.tsx',
      ),
    ]),
    layout('./admin.tsx', [
      route('manage', './manage.tsx'),
      route(
        'manage/topics',
        '../../../packages/internal-web-features/src/topic-admin/list-route.tsx',
      ),
      route(
        'manage/topics/new',
        '../../../packages/internal-web-features/src/topic-admin/new-route.tsx',
      ),
      route(
        'manage/topics/:id',
        '../../../packages/internal-web-features/src/topic-admin/edit-route.tsx',
      ),
      route(
        'manage/topics/:id/delete',
        '../../../packages/internal-web-features/src/topic-admin/delete-route.tsx',
      ),
    ]),
  ]),
  route('*', '../../../packages/ui/src/not-found-route.tsx'),
] satisfies RouteConfig;
