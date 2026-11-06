import { CardList, searchPattern } from '@fphd/ui';
import type { TopicSummary } from './loader.ts';

export function matchingTopics(topics: TopicSummary[], query: string) {
  const pattern = searchPattern(query);
  return pattern
    ? topics.filter((topic) => pattern.test(topic.title) || pattern.test(topic.description))
    : topics;
}

export function TopicResults({
  topics,
  query,
  columns = 'one',
  headingLevel = 3,
}: {
  topics: TopicSummary[];
  query: string;
  columns?: 'one' | 'three';
  headingLevel?: 2 | 3;
}) {
  return (
    <CardList
      columns={columns}
      headingLevel={headingLevel}
      searchTerm={query}
      items={topics.map((topic) => ({
        description: topic.description,
        href: `/topics/${topic.slug}`,
        title: topic.title,
      }))}
    />
  );
}
