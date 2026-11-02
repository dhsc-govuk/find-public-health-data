import { formatDocumentTitle } from '@fphd/ui';
import { type MetaFunction, useLoaderData } from 'react-router';
import { loadDashboard } from './loader.ts';
import { DashboardPage, dashboardHeading } from './page.tsx';

export const loader = loadDashboard;

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
  { title: formatDocumentTitle(dashboardHeading(loaderData)) },
];

export function DashboardRoute() {
  const { underReview, toReview, list } = useLoaderData<typeof loader>();
  return <DashboardPage underReview={underReview} toReview={toReview} list={list} />;
}

export default DashboardRoute;
