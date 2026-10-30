// @vitest-environment jsdom
import { fakeUsersForAudience } from '@fphd/auth';
import {
  AdminTopicsPage,
  DeleteTopicPage,
  EditTopicPage,
  ManageDataPage,
  NewTopicPage,
  SignInLandingPage,
} from '@fphd/internal-web-features';
import { SignInPage, TopicsRoute } from '@fphd/public-web-features';
import { backLinkHandle } from '@fphd/ui';
import type { RouteConfigEntry } from '@react-router/dev/routes';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createRoutesStub } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import InternalApp, { ErrorBoundary } from './root.tsx';
import routes from './routes.ts';

afterEach(cleanup);

const topics = [{ slug: 'topic-a', title: 'Topic A', description: 'All about topic A.' }];

const signedOut = { canManage: false, signedIn: false };
const publisher = { canManage: false, signedIn: true };
const admin = { canManage: true, signedIn: true };

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

    expect(await screen.findByText('Internal')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Manage public health data' })).toBeTruthy();
  });

  it('offers only internal fake users on the internal sign-in page', () => {
    render(
      <SignInPage
        audience="internal"
        returnTo="/manage"
        users={fakeUsersForAudience('internal')}
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(screen.queryByText('Alex Morgan')).toBeNull();
    expect(screen.getByText('Sam Taylor')).toBeTruthy();
    expect(screen.getByText('Riley Singh')).toBeTruthy();
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
  });

  it('keeps every publishing route under the publisher layout', () => {
    const publisher = findLayout(routes, 'publisher.tsx');
    const gated = pathsIn(routes).filter((path) => /^publish(\/|$)/.test(path));

    expect(publisher?.children?.map((child) => child.path)).toEqual(gated);
    expect(gated).toContain('publish/indicators/:id/task-list');
    expect(gated).toContain('publish/indicators/:id/withdraw-submission');
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

// The GOV.UK link components read the router, so a page cannot be rendered
// bare — the same stub the route tests above use stands in for it.
function renderPage(page: ReactNode) {
  const Routes = createRoutesStub([{ path: '/manage/topics/:id', Component: () => page }]);

  return render(
    <Routes initialEntries={['/manage/topics/00000000-0000-7000-8000-000000000001']} />,
  );
}

describe('the manage topics page', () => {
  const topic = {
    id: '00000000-0000-7000-8000-000000000001',
    slug: 'air-quality',
    title: 'Air quality',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-04T23:30:00.000Z',
  };

  it('links each topic name to its edit page and shows when it last changed', async () => {
    renderPage(<AdminTopicsPage topics={[topic]} />);

    const link = await screen.findByRole('link', { name: 'Air quality' });

    expect(link.getAttribute('href')).toBe(`/manage/topics/${topic.id}`);
    // 23:30 UTC on the 4th is 00:30 on the 5th in London — the display zone, not the server's.
    expect(screen.getByText('5 Aug 2026')).toBeTruthy();
  });

  it('names the columns a publisher needs', async () => {
    renderPage(<AdminTopicsPage topics={[topic]} />);

    for (const heading of ['Topic name', 'Slug', 'Last updated']) {
      expect(await screen.findByRole('columnheader', { name: heading })).toBeTruthy();
    }
  });

  it('offers a way to add a topic', async () => {
    renderPage(<AdminTopicsPage topics={[topic]} />);

    // The GOV.UK button component renders an anchor with role="button", not a plain link.
    expect((await screen.findByRole('button', { name: 'Add a topic' })).getAttribute('href')).toBe(
      '/manage/topics/new',
    );
  });

  it('shows the message a create or delete left behind', async () => {
    renderPage(<AdminTopicsPage notification="Topic deleted" topics={[topic]} />);

    expect(await screen.findByText('Topic deleted')).toBeTruthy();
  });
});

describe('the add topic page', () => {
  it('starts from an empty form that posts back to the same URL', async () => {
    const { container } = renderPage(<NewTopicPage />);

    expect((await screen.findByLabelText('Topic name')).getAttribute('value')).toBe('');
    expect(screen.getByLabelText('Description').textContent).toBe('');

    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.hasAttribute('action')).toBe(false);
    expect(screen.getByRole('button', { name: 'Create topic' })).toBeTruthy();
  });

  it('keeps what was typed and shows field errors when a create is rejected', async () => {
    renderPage(
      <NewTopicPage
        fieldErrors={{ slug: 'This slug is already used' }}
        values={{ title: 'Air quality', slug: 'air-quality', description: 'About air quality.' }}
      />,
    );

    expect((await screen.findByLabelText('Topic name')).getAttribute('value')).toBe('Air quality');

    const summary = await screen.findByRole('alert');
    expect(summary.textContent).toContain('This slug is already used');
  });
});

describe('the delete topic confirmation page', () => {
  const topic = {
    id: '00000000-0000-7000-8000-000000000001',
    slug: 'air-quality',
    title: 'Air quality',
    description: 'About air quality.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-08-04T23:30:00.000Z',
    linkedIndicatorCount: 0,
    version: 'a'.repeat(64),
  };

  it('names the topic and warns the delete cannot be undone', async () => {
    renderPage(<DeleteTopicPage topic={topic} />);

    expect(await screen.findByRole('heading', { name: 'Delete topic' })).toBeTruthy();
    expect(screen.getByText(/cannot be undone/)).toBeTruthy();
    expect(screen.getByText('Air quality')).toBeTruthy();
  });

  it('confirms with a plain-form warning button and offers a way back', async () => {
    const { container } = renderPage(<DeleteTopicPage topic={topic} />);

    const button = await screen.findByRole('button', { name: 'Delete topic' });
    expect(button.className).toContain('govuk-button--warning');

    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.hasAttribute('action')).toBe(false);

    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe(
      `/manage/topics/${topic.id}`,
    );
  });
});

describe('the edit topic page', () => {
  const topicId = '00000000-0000-7000-8000-000000000001';
  const values = { title: 'Air quality', slug: 'air-quality', description: 'About air quality.' };
  const version = 'a'.repeat(64);

  it('pre-fills the form and offers a way back to the list', async () => {
    renderPage(
      <EditTopicPage
        linkedIndicatorCount={0}
        topicId={topicId}
        values={values}
        version={version}
      />,
    );

    expect((await screen.findByLabelText('Topic name')).getAttribute('value')).toBe('Air quality');
    expect(screen.getByLabelText('Slug').getAttribute('value')).toBe('air-quality');
    expect(screen.getByLabelText('Description').textContent).toBe('About air quality.');
    expect(screen.getByRole('link', { name: 'Return to topic list' }).getAttribute('href')).toBe(
      '/manage/topics',
    );
  });

  it('submits back to the same URL with a plain form, so it works without JavaScript', async () => {
    const { container } = renderPage(
      <EditTopicPage
        linkedIndicatorCount={0}
        topicId={topicId}
        values={values}
        version={version}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Save' })).toBeTruthy();

    const form = container.querySelector('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.hasAttribute('action')).toBe(false);
  });

  it('shows the success message the save left behind', async () => {
    renderPage(
      <EditTopicPage
        linkedIndicatorCount={0}
        notification="Topic updated"
        topicId={topicId}
        values={values}
        version={version}
      />,
    );

    expect(await screen.findByText('Topic updated')).toBeTruthy();
  });

  it('links to the delete confirmation page for this topic', async () => {
    renderPage(
      <EditTopicPage
        linkedIndicatorCount={0}
        topicId={topicId}
        values={values}
        version={version}
      />,
    );

    expect((await screen.findByRole('link', { name: 'Delete topic' })).getAttribute('href')).toBe(
      `/manage/topics/${topicId}/delete`,
    );
  });

  it('shows no notification banner when there is nothing to report', async () => {
    const { container } = renderPage(
      <EditTopicPage
        linkedIndicatorCount={0}
        topicId={topicId}
        values={values}
        version={version}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Save' })).toBeTruthy();
    expect(container.querySelector('.govuk-notification-banner')).toBeNull();
  });

  it('summarises errors in field order, each linking to its control', async () => {
    renderPage(
      <EditTopicPage
        linkedIndicatorCount={0}
        fieldErrors={{ description: 'Enter a description', title: 'Enter a topic name' }}
        topicId={topicId}
        values={{ ...values, title: '', description: '' }}
        version={version}
      />,
    );

    const summary = await screen.findByRole('alert');
    const links = [...summary.querySelectorAll('a')];

    expect(links.map((link) => link.textContent)).toEqual([
      'Enter a topic name',
      'Enter a description',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#title-input',
      '#description-input',
    ]);
  });

  // The message appears twice by design — once in the summary, once against the control —
  // so this looks for the one the field points at with aria-describedby.
  it('repeats each message against its own field and keeps what was typed', async () => {
    const { container } = renderPage(
      <EditTopicPage
        linkedIndicatorCount={0}
        fieldErrors={{ slug: 'Enter a slug' }}
        topicId={topicId}
        values={{ ...values, slug: '', title: 'A half-finished edit' }}
        version={version}
      />,
    );

    const slug = await screen.findByLabelText('Slug');

    expect(slug.getAttribute('aria-describedby')).toContain('slug-error');
    expect(container.querySelector('#slug-error')?.textContent).toContain('Enter a slug');
    expect(screen.getByLabelText('Topic name').getAttribute('value')).toBe('A half-finished edit');
  });
});
