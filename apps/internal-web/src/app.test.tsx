// @vitest-environment jsdom
import { ManageDataPage, SignInLandingPage } from '@fphd/internal-web-features';
import { TopicsRoute } from '@fphd/public-web-features';
import { backLinkHandle, serviceName } from '@fphd/ui';
import type { RouteConfigEntry } from '@react-router/dev/routes';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRoutesStub, Meta } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import InternalApp, { ErrorBoundary, meta } from './root.tsx';
import routes from './routes.ts';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const topics = [{ slug: 'topic-a', title: 'Topic A', description: 'All about topic A.' }];

const signedOut = { canEditIndicators: false, canManage: false, signedIn: false };
const publisher = { canEditIndicators: true, canManage: false, signedIn: true };
const admin = { canEditIndicators: false, canManage: true, signedIn: true };
const reviewer = { canEditIndicators: false, canManage: false, signedIn: true };

describe('internal application routes', () => {
  it('includes the shared public routes', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: InternalApp,
        loader: () => publisher,
        children: [{ path: 'topics', Component: TopicsRoute, loader: () => topics }],
      },
    ]);

    render(<Routes initialEntries={['/topics']} />);

    expect(await screen.findByRole('heading', { name: 'Public health topics' })).toBeTruthy();
  });

  it('includes internal-only routes', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: InternalApp,
        loader: () => admin,
        children: [{ path: 'manage', Component: ManageDataPage }],
      },
    ]);

    render(<Routes initialEntries={['/manage']} />);

    expect(await screen.findByText('Beta')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Manage public health data' })).toBeTruthy();
  });

  it('asks for feedback at the mailbox from the root loader', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: InternalApp,
        loader: () => ({ ...publisher, feedbackMailbox: 'feedback@example.com' }),
        children: [{ path: 'topics', Component: TopicsRoute, loader: () => topics }],
      },
    ]);

    render(<Routes initialEntries={['/topics']} />);

    expect(
      (await screen.findByRole('link', { name: 'feedback@example.com' })).getAttribute('href'),
    ).toBe('mailto:feedback@example.com');
  });

  it('hides data management from publishers', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: InternalApp,
        loader: () => publisher,
        children: [{ path: 'topics', Component: TopicsRoute, loader: () => topics }],
      },
    ]);

    render(<Routes initialEntries={['/topics']} />);

    expect(await screen.findByRole('heading', { name: 'Public health topics' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Manage' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Account' })).toBeTruthy();
  });

  it('shows data management to admins', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: InternalApp,
        loader: () => admin,
        children: [{ path: 'topics', Component: TopicsRoute, loader: () => topics }],
      },
    ]);

    render(<Routes initialEntries={['/topics']} />);

    expect(await screen.findByRole('link', { name: 'Manage' })).toBeTruthy();
  });

  it('links publishers to the publisher guidance from the navigation', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: InternalApp,
        loader: () => publisher,
        children: [{ path: 'topics', Component: TopicsRoute, loader: () => topics }],
      },
    ]);

    render(<Routes initialEntries={['/topics']} />);

    const navigation = await screen.findByRole('navigation', { name: 'Menu' });
    expect(
      within(navigation)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Guidance', '/publish/guidance'],
      ['Account', '/sign-in'],
    ]);
  });

  it.each([
    ['admins', admin],
    ['reviewers who do not publish', reviewer],
    ['signed-out visitors', signedOut],
  ])('offers no guidance link to %s', async (_case, user) => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: InternalApp,
        loader: () => user,
        children: [{ path: 'topics', Component: TopicsRoute, loader: () => topics }],
      },
    ]);

    render(<Routes initialEntries={['/topics']} />);

    const navigation = await screen.findByRole('navigation', { name: 'Menu' });
    expect(within(navigation).queryByRole('link', { name: 'Guidance' })).toBeNull();
  });

  it('places a route-declared back link above the main content', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: InternalApp,
        loader: () => publisher,
        children: [
          {
            path: 'manage',
            Component: ManageDataPage,
            handle: backLinkHandle('/dashboard'),
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/manage']} />);

    const backLink = await screen.findByRole('link', { name: 'Back' });

    expect(backLink.getAttribute('href')).toBe('/dashboard');
    expect(backLink.closest('main')).toBeNull();
  });

  it('shows a not-found page with no back link when the route declaring one is a 404', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: InternalApp,
        ErrorBoundary,
        loader: () => publisher,
        children: [
          {
            path: 'dashboard/indicators/:id',
            Component: ManageDataPage,
            handle: backLinkHandle('/dashboard'),
            loader: () => {
              throw new Response('Not Found', { status: 404 });
            },
          },
        ],
      },
    ]);

    render(<Routes initialEntries={['/dashboard/indicators/not-an-id']} />);

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Back' })).toBeNull();
  });

  it('shows the environment banner from the root loader', async () => {
    const Routes = createRoutesStub([
      {
        id: 'root',
        path: '/',
        Component: InternalApp,
        loader: () => ({ ...publisher, environmentName: 'Test' }),
        children: [{ path: 'topics', Component: TopicsRoute, loader: () => topics }],
      },
    ]);

    render(<Routes initialEntries={['/topics']} />);

    expect((await screen.findByRole('region', { name: 'Environment' })).textContent).toContain(
      'Test',
    );
  });

  it('offers a signed-out visitor sign in rather than an account', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: InternalApp,
        loader: () => signedOut,
        children: [{ path: '/', Component: () => <SignInLandingPage signInHref="/sign-in" /> }],
      },
    ]);

    render(<Routes initialEntries={['/']} />);

    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Account' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Manage' })).toBeNull();
  });

  const PAGE = 'http://localhost/publish/indicators/new';

  it.each([
    ['fetches a page restored from the browser cache again', true, [[PAGE]]],
    ['leaves a freshly loaded page alone', false, []],
  ])('%s', async (_case, persisted, fetches) => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, href: PAGE, replace });
    const Routes = createRoutesStub([
      {
        path: '/',
        Component: InternalApp,
        loader: () => publisher,
        children: [{ path: 'manage', Component: ManageDataPage }],
      },
    ]);

    const listen = vi.spyOn(window, 'addEventListener');

    render(<Routes initialEntries={['/manage']} />);
    await screen.findByRole('heading', { name: 'Manage public health data' });
    // React can run the effect that adds the pageshow listener after the heading appears, so wait
    // for the listener before firing the event. Otherwise the event can arrive with no one listening.
    await waitFor(() => expect(listen).toHaveBeenCalledWith('pageshow', expect.any(Function)));

    const shown = new Event('pageshow');
    Object.assign(shown, { persisted });
    fireEvent(window, shown);

    expect(replace.mock.calls).toEqual(fetches);
  });
});

describe('the role-gated route tables', () => {
  function findLayout(entries: RouteConfigEntry[], file: string): RouteConfigEntry | undefined {
    for (const entry of entries) {
      if (entry.file.endsWith(file)) return entry;

      const found = entry.children && findLayout(entry.children, file);
      if (found) return found;
    }

    return undefined;
  }

  function pathsIn(entries: RouteConfigEntry[]): string[] {
    return entries.flatMap((entry) => [
      ...(entry.path === undefined ? [] : [entry.path]),
      ...pathsIn(entry.children ?? []),
    ]);
  }

  // Each role middleware is declared once, on its layout. If a route escapes it the page is
  // reachable by any internal user, and nothing else in the app would say so.
  it('keeps every dashboard route under the dashboard layout', () => {
    const dashboard = findLayout(routes, 'dashboard.tsx');
    const gated = pathsIn(routes).filter((path) => /^dashboard(\/|$)/.test(path));

    expect(dashboard?.children?.map((child) => child.path)).toEqual(gated);
    expect(gated).toContain('dashboard/indicators/:id');
    expect(gated).toContain('dashboard/indicators/:id/assign-reviewers');
    expect(gated).toContain('dashboard/indicators/:id/publication-date');
    expect(gated).toContain('dashboard/indicators/:id/review/revisions');
    for (const path of [
      'preview',
      'preview/table.csv',
      'preview/all-data.csv',
      'preview/metadata.txt',
      'preview/geographies',
      'preview/compare-areas',
      'preview/indicators/search',
    ]) {
      expect(gated).toContain(`dashboard/indicators/:id/${path}`);
    }
  });

  it('keeps every publishing route under the publisher layout', () => {
    const publisher = findLayout(routes, 'publisher.tsx');
    const gated = pathsIn(routes).filter((path) => /^publish(\/|$)/.test(path));

    expect(publisher?.children?.map((child) => child.path)).toEqual(gated);
    expect(gated).toContain('publish/indicators/:id/task-list');
    expect(gated).toContain('publish/indicators/:id/withdraw-submission');
    expect(gated).toContain('publish/indicators/:id/discard-draft');
    expect(gated).toContain('publish/indicators/:id/start-update');
    expect(gated).toContain('publish/guidance');
  });

  it('keeps every manage route under the admin layout', () => {
    const admin = findLayout(routes, 'admin.tsx');
    const gated = pathsIn(routes).filter((path) => /^manage(\/|$)/.test(path));

    expect(admin?.children?.map((child) => child.path)).toEqual(gated);
    expect(gated).toContain('manage');
  });

  it('nests the role layouts inside the authenticated one', () => {
    const authenticated = findLayout(routes, 'authenticated.tsx');

    expect(findLayout(authenticated?.children ?? [], 'dashboard.tsx')).toBeDefined();

    expect(findLayout(authenticated?.children ?? [], 'publisher.tsx')).toBeDefined();
    expect(findLayout(authenticated?.children ?? [], 'admin.tsx')).toBeDefined();
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
        loader: () => publisher,
        Component: () => (
          <>
            <Meta />
            <InternalApp />
          </>
        ),
        ErrorBoundary: () => (
          <>
            <Meta />
            <ErrorBoundary />
          </>
        ),
        children: [{ path: 'dashboard/indicators/:id', Component: ManageDataPage, loader }],
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

    render(<Routes initialEntries={['/dashboard/indicators/not-an-id']} />);

    const { heading, titles } = await titlesAndHeading();
    expect(heading).toBe('Page not found');
    expect(titles).toEqual([`${heading} - ${serviceName} - GOV.UK`]);
  });

  it('titles the error page after its heading when a loader fails', async () => {
    const Routes = routesWithMeta(() => {
      throw new Error('The API is down');
    });

    render(
      <Routes initialEntries={['/dashboard/indicators/0198a2b4-0000-7000-8000-000000000000']} />,
    );

    const { heading, titles } = await titlesAndHeading();
    expect(heading).toBe('Sorry, there is a problem with the service');
    expect(titles).toEqual([`${heading} - ${serviceName} - GOV.UK`]);
  });
});
