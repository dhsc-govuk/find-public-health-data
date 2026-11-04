import { formatDocumentTitle } from '@fphd/ui';
import { type MetaFunction, type ShouldRevalidateFunctionArgs, useLoaderData } from 'react-router';
import { topicDataKey } from './filters.ts';
import { loadTopicPage } from './loader.ts';
import { TopicPage } from './page.tsx';

export const loader = loadTopicPage;

export function shouldRevalidate({ currentUrl, nextUrl }: ShouldRevalidateFunctionArgs) {
  return topicDataKey(currentUrl) !== topicDataKey(nextUrl);
}

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
  { title: formatDocumentTitle(loaderData?.topic.title ?? 'Topic') },
];

export function TopicRoute() {
  const data = useLoaderData<typeof loader>();
  return <TopicPage {...data} />;
}

export default TopicRoute;
