// @vitest-environment jsdom
import {
  HomeRoute,
  IndicatorRoute,
  PublicHomePage,
  TopicRoute,
  TopicsRoute,
} from '@fphd/public-web-features';
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub, Meta } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PublicApp, { ErrorBoundary, meta } from './root.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('public application routes', () => {
  it('renders the landing page introduction and shell navigation', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [{ index: true, Component: HomeRoute }],
      },
    ]);

    render(<Routes initialEntries={['/']} />);

    expect(await screen.findByRole('heading', { name: 'Find public health data' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Public health data' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Using this service' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ways to find data' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse by topic' }).getAttribute('href')).toBe(
      '/topics',
    );
    expect(screen.getByRole('link', { name: 'Topics' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'GOV.UK' })).toBeTruthy();
  });

  it('renders the topics page as an alphabetical list of links from loader data', async () => {
    // Ordering is the repository/API's responsibility (asserted elsewhere); this fixture is
    // already alphabetical, and the page must render it in that order without reshuffling.
    const topics = [
      { slug: 'topic-a', title: 'Topic A', description: 'All about topic A.' },
      { slug: 'topic-b', title: 'Topic B', description: 'All about topic B.' },
    ];
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [{ path: 'topics', Component: TopicsRoute, loader: () => topics }],
      },
    ]);

    render(<Routes initialEntries={['/topics']} />);

    expect(await screen.findByRole('heading', { name: 'Public health topics' })).toBeTruthy();

    const links = screen.getAllByRole('link', { name: /^Topic [AB]$/ });
    expect(links.map((link) => link.textContent)).toEqual(['Topic A', 'Topic B']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/topics/topic-a',
      '/topics/topic-b',
    ]);
    expect(screen.getByText('All about topic A.')).toBeTruthy();
    expect(screen.getByText('All about topic B.')).toBeTruthy();
  });

  it('renders the topic page title and description from loader data', async () => {
    const topic = {
      slug: 'topic-a',
      title: 'Topic A',
      description: 'All about topic A.',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    };
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [
          {
            path: 'topics/:slug',
            Component: TopicRoute,
            loader: () => ({
              topic,
              content: null,
            }),
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/topics/topic-a']} />);

    expect(await screen.findByRole('heading', { name: 'Topic A' })).toBeTruthy();
    expect(screen.getByText('All about topic A.')).toBeTruthy();
  });

  it('renders the not-found page when the indicator loader throws a 404 response', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        ErrorBoundary,
        children: [
          {
            path: 'indicator/:slug',
            Component: IndicatorRoute,
            loader: () => {
              throw new Response('Not Found', { status: 404 });
            },
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/indicator/no-such-indicator']} />);

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });

  it('renders the not-found page when the topic loader throws a 404 response', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        ErrorBoundary,
        children: [
          {
            path: 'topics/:slug',
            Component: TopicRoute,
            loader: () => {
              throw new Response('Not Found', { status: 404 });
            },
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/topics/no-such-topic']} />);

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });

  it('shows the environment banner and feedback link from the root loader', async () => {
    const Routes = createRoutesStub([
      {
        id: 'root',
        path: '/',
        Component: PublicApp,
        loader: () => ({ environmentName: 'Dev', feedbackMailbox: 'feedback@example.com' }),
        children: [{ index: true, Component: PublicHomePage }],
      },
    ]);

    render(<Routes initialEntries={['/']} />);

    expect((await screen.findByRole('region', { name: 'Environment' })).textContent).toContain(
      'Dev',
    );
    expect(screen.getByRole('link', { name: 'feedback@example.com' }).getAttribute('href')).toBe(
      'mailto:feedback@example.com',
    );
  });

  it('keeps the environment banner on an error page when the root loader ran', async () => {
    const Routes = createRoutesStub([
      {
        id: 'root',
        path: '/',
        Component: PublicApp,
        ErrorBoundary,
        loader: () => ({ environmentName: 'Test', feedbackMailbox: undefined }),
        children: [
          {
            path: 'topics/:slug',
            Component: TopicRoute,
            loader: () => {
              throw new Error('The API is down');
            },
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/topics/diabetes']} />);

    expect(
      await screen.findByRole('heading', { name: 'Sorry, there is a problem with the service' }),
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Environment' }).textContent).toContain('Test');
  });

  it('nav includes Search between Home and Topics', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: PublicApp,
        children: [{ index: true, Component: PublicHomePage }],
      },
    ]);

    render(<Routes initialEntries={['/']} />);

    await screen.findByRole('heading', { name: 'Find public health data' });
    expect(screen.getByRole('link', { name: 'Search' }).getAttribute('href')).toBe('/search');
  });
});

describe('error page titles', () => {
  // createRoutesStub ignores the root's Layout, which renders Meta in the app, so the root
  // route's component and error boundary render Meta here instead.
  function routesWithMeta(loader: () => never) {
    return createRoutesStub([
      {
        id: 'root',
        path: '/',
        meta,
        Component: () => (
          <>
            <Meta />
            <PublicApp />
          </>
        ),
        ErrorBoundary: () => (
          <>
            <Meta />
            <ErrorBoundary />
          </>
        ),
        children: [{ path: 'topics/:slug', Component: TopicRoute, loader }],
      },
    ]);
  }

  async function titlesAndHeading() {
    const heading = await screen.findByRole('heading', { level: 1 });
    const titles = [...document.head.querySelectorAll('title')].map((title) => title.textContent);
    return { heading: heading.textContent, titles };
  }

  it('titles the not-found page from a loader 404 after its heading', async () => {
    const Routes = routesWithMeta(() => {
      throw new Response('Not Found', { status: 404 });
    });

    render(<Routes initialEntries={['/topics/no-such-topic']} />);

    const { heading, titles } = await titlesAndHeading();
    expect(heading).toBe('Page not found');
    expect(titles).toEqual([`${heading} - ${serviceName} - GOV.UK`]);
  });

  it('titles the error page after its heading when a loader fails', async () => {
    const Routes = routesWithMeta(() => {
      throw new Error('The API is down');
    });

    render(<Routes initialEntries={['/topics/diabetes']} />);

    const { heading, titles } = await titlesAndHeading();
    expect(heading).toBe('Sorry, there is a problem with the service');
    expect(titles).toEqual([`${heading} - ${serviceName} - GOV.UK`]);
  });
});
