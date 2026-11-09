// @vitest-environment jsdom
import { MAX_INDICATOR_QUERY_LENGTH } from '@fphd/public-api-features/contract';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { matchingTopics, TopicResults } from './results.tsx';

afterEach(cleanup);

const mortalityTopic = {
  slug: 'mortality',
  title: 'Mortality and life expectancy',
  description: 'Rates and trends.',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const topics = [
  mortalityTopic,
  {
    ...mortalityTopic,
    slug: 'health',
    title: 'Public health',
    description: 'Mortality and life expectancy data.',
  },
  { ...mortalityTopic, slug: 'diabetes', title: 'Diabetes', description: 'Diabetes data.' },
];

describe('matchingTopics', () => {
  it.each(['  MORTALITY  and\tlife\nexpectancy  ', 'mortality\u0000and life expectancy'])(
    'cleans %j before matching titles and descriptions',
    (query) => {
      expect(matchingTopics(topics, query)).toEqual(topics.slice(0, 2));
    },
  );

  it('bounds long queries to the same length as indicator search', () => {
    const query = 'x'.repeat(MAX_INDICATOR_QUERY_LENGTH);
    const longTopics = [{ ...mortalityTopic, title: query }];
    expect(matchingTopics(longTopics, `  ${query} ignored`)).toEqual(longTopics);
  });

  it('returns all topics for a query containing only whitespace and control characters', () => {
    expect(matchingTopics(topics, ' \t\u0000\n ')).toEqual(topics);
  });
});

describe('TopicResults', () => {
  it.each([
    ['Mortality and life expectancy', ' mortality\u0000 and\tlife\nexpectancy '],
    ['x'.repeat(MAX_INDICATOR_QUERY_LENGTH), `${'x'.repeat(MAX_INDICATOR_QUERY_LENGTH)} ignored`],
  ])('highlights %j using the same cleaned query as matching', (title, query) => {
    const matching = [{ ...mortalityTopic, title }];
    const { container } = render(
      <MemoryRouter>
        <TopicResults topics={matchingTopics(matching, query)} query={query} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: title })).toBeTruthy();
    expect(container.querySelector('mark')?.textContent).toBe(title);
  });
});
