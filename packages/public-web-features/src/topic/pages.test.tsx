// @vitest-environment jsdom
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient } from '@fphd/web-server/testing';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterContextProvider,
  RouterProvider,
} from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { indicatorDetail, observation } from '../indicator/view.testing.ts';
import { TopicListing } from './listing.tsx';
import { loadTopicPage } from './loader.ts';
import { TopicsPage } from './pages.tsx';

afterEach(cleanup);

afterEach(() => {
  vi.useRealTimers();
});

const topics = [
  { slug: 'smoking', title: 'Smoking', description: 'Smoking prevalence and quitting.' },
  { slug: 'alcohol', title: 'Alcohol', description: 'Drinking and related harms.' },
  { slug: 'hidden-quitting', title: 'Cancer', description: 'Screening and diagnosis.' },
].map((topic) => ({
  ...topic,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}));

describe('TopicsPage', () => {
  it('preserves and filters text entered before hydration through later renders', async () => {
    const page = (currentTopics = topics) => (
      <MemoryRouter>
        <TopicsPage topics={currentTopics} />
      </MemoryRouter>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(page());
    document.body.append(container);
    const input = container.querySelector('input');
    if (!input) throw new Error('Expected the server-rendered search input');
    input.value = 'quitting';
    const onRecoverableError = vi.fn();
    const root = await act(() => hydrateRoot(container, page(), { onRecoverableError }));
    try {
      await act(() => root.render(page([...topics])));
      expect(container.querySelector('input')).toBe(input);
      expect(input.value).toBe('quitting');
      expect(
        screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
      ).toEqual(['Smoking']);
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it.each(['', '  ', 'health'])(
    'shows an unavailable message for an empty dataset with query %s',
    (initialQuery) => {
      render(
        <MemoryRouter initialEntries={[`/topics?q=${encodeURIComponent(initialQuery)}`]}>
          <TopicsPage topics={[]} />
        </MemoryRouter>,
      );

      expect(screen.getByText('No topics are available.')).toBeTruthy();
      expect(screen.queryByText('No topics match your search.')).toBeNull();
      expect(screen.getByRole('status').textContent).toBe('');
    },
  );

  it('uses the same Unicode matching rule to filter and highlight topic content', () => {
    const { container } = render(
      <MemoryRouter>
        <TopicsPage
          topics={[
            { slug: 'istanbul', title: 'İstanbul', description: 'Town' },
            { slug: 'kelvin', title: 'K', description: 'Town' },
          ].map((topic) => ({
            ...topic,
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          }))}
        />
      </MemoryRouter>,
    );
    const input = screen.getByRole('searchbox', { name: 'Search for topics' });
    fireEvent.change(input, { target: { value: 'i' } });
    expect(screen.queryByRole('link')).toBeNull();

    fireEvent.change(input, { target: { value: 'İ' } });
    expect(screen.getByRole('link', { name: 'İstanbul' })).toBeTruthy();
    expect(container.querySelector('mark')?.textContent).toBe('İ');

    fireEvent.change(input, { target: { value: 'k' } });
    expect(screen.getByRole('link', { name: 'K' })).toBeTruthy();
    expect(container.querySelector('mark')?.textContent).toBe('K');
  });

  it('renders a search button until hydration completes without replacing the input', async () => {
    const page = (
      <MemoryRouter>
        <TopicsPage topics={topics} />
      </MemoryRouter>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(page);
    document.body.append(container);
    const input = container.querySelector('input');
    const onRecoverableError = vi.fn();
    expect(container.querySelector('button')?.textContent).toBe('Search');

    const root = await act(() => hydrateRoot(container, page, { onRecoverableError }));
    try {
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.querySelector('input')).toBe(input);
      expect(container.querySelector('button')).toBeNull();
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search for topics' }), {
        target: { value: 'quitting' },
      });
      expect(
        screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
      ).toEqual(['Smoking']);
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('filters by title and description as the user types, ignoring case and surrounding spaces', async () => {
    render(
      <MemoryRouter>
        <TopicsPage topics={topics} />
      </MemoryRouter>,
    );
    const input = screen.getByRole('searchbox', { name: 'Search for topics' });

    fireEvent.change(input, { target: { value: ' ALCO ' } });
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Alcohol']);

    fireEvent.change(input, { target: { value: 'quitting' } });
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Smoking']);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('1 topic found.'));
  });

  it('shows an empty result message and restores the original list when the search is cleared', async () => {
    const { container } = render(
      <MemoryRouter>
        <TopicsPage topics={topics} />
      </MemoryRouter>,
    );
    const input = screen.getByRole('searchbox', { name: 'Search for topics' });

    fireEvent.change(input, { target: { value: '[nothing]' } });
    expect(screen.getByText('No topics match your search.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('0 topics found.'));

    fireEvent.change(input, { target: { value: ' ' } });
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(topics.map((topic) => topic.title));
    expect(screen.queryByText('No topics match your search.')).toBeNull();
    expect(container.querySelector('mark')).toBeNull();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('3 topics found.'));
  });

  it('filters immediately but announces only the result after typing pauses', async () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <TopicsPage topics={topics} />
      </MemoryRouter>,
    );
    const input = screen.getByRole('searchbox', { name: 'Search for topics' });
    fireEvent.change(input, { target: { value: 'alco' } });
    expect(screen.getByRole('link', { name: 'Alcohol' })).toBeTruthy();
    await act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('status').textContent).toBe('3 topics found.');
    fireEvent.change(input, { target: { value: 'unmatched' } });
    expect(screen.queryByRole('link')).toBeNull();
    await act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('status').textContent).toBe('3 topics found.');
    await act(() => vi.advanceTimersByTime(100));
    expect(screen.getByRole('status').textContent).toBe('0 topics found.');
  });
});

it('moves focus from the Data controls to the indicators table without changing the URL hash', async () => {
  const context = new RouterContextProvider();
  context.set(
    apiContext,
    createFakeApiClient({
      'GET /api/topics/example': {
        slug: 'example',
        title: 'Example',
        description: '',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      'GET /api/topics/example/trends': {
        total: 1,
        better: 0,
        worse: 0,
        unchanged: 0,
        increasing: 0,
        decreasing: 0,
        unavailable: 1,
      },
      'GET /api/areas/display-groups': [],
      'GET /api/areas': [],
      'GET /api/indicators/facets': {
        topics: [],
        classifications: [],
        sources: [],
        valueTypes: [],
        yearTypes: [],
      },
      'GET /api/indicators/search': {
        total: 1,
        limit: 200,
        indicators: [
          { shortId: 1, slug: 'indicator-1', name: 'Indicator', topics: [], classifications: [] },
        ],
      },
      'GET /api/indicator-data': [
        {
          detail: indicatorDetail(1),
          areaData: [{ areaCode: 'E92000001', areaName: 'England', observations: [observation()] }],
        },
      ],
    }),
  );
  const data = await loadTopicPage({
    url: new URL('http://local/topics/example?tab-topic=data&render=complete'),
    pattern: '/topics/:slug',
    context,
    params: { slug: 'example' },
    request: new Request('http://local/topics/example?tab-topic=data&render=complete'),
  });
  const content = await data.content;
  if (!content) throw new Error('Expected topic table data');
  const router = createMemoryRouter(
    [
      {
        path: '/topics/example',
        element: <TopicListing data={{ topic: data.topic, ...content }} />,
      },
    ],
    { initialEntries: ['/topics/example?tab-topic=data#topic-data'] },
  );
  render(<RouterProvider router={router} />);
  const skip = screen.getByRole('link', { name: 'Skip to indicators table' });
  const table = screen.getByRole('table');
  expect(skip.getAttribute('href')).toBe(`#${table.id}`);
  expect(
    skip.compareDocumentPosition(screen.getByRole('combobox', { name: 'Sort by' })) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.click(skip);
  expect(document.activeElement).toBe(table);
  expect(router.state.location.hash).toBe('#topic-data');
  expect(router.state.location.search).toBe('?tab-topic=data');
});
