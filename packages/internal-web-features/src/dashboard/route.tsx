import { formatDocumentTitle } from '@fphd/ui';
import { type MetaFunction, useLoaderData } from 'react-router';
import { loadDashboard } from './loader.ts';
import { DashboardPage, dashboardHeading } from './page.tsx';

export const loader = loadDashboard;

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
  { title: formatDocumentTitle(dashboardHeading(loaderData)) },
];

export function DashboardRoute() {
  const {
    search,
    underReview,
    toReview,
    scheduled,
    awaitingDecision,
    list,
    otherList,
    notification,
  } = useLoaderData<typeof loader>();
  return (
    <DashboardPage
      search={search}
      underReview={underReview}
      toReview={toReview}
      scheduled={scheduled}
      awaitingDecision={awaitingDecision}
      list={list}
      otherList={otherList}
      notification={notification}
    />
  );
}

export default DashboardRoute;
