// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub, Meta, Outlet } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { RootErrorBoundary, rootMeta } from './root-error-boundary.tsx';
import { serviceName } from './service-name.ts';

afterEach(cleanup);

describe('rootMeta', () => {
  it('titles a page that sets no title of its own with only the service name', async () => {
    const Routes = createRoutesStub([
      {
        path: '/',
        meta: rootMeta,
        Component: () => (
          <>
            <Meta />
            <Outlet />
          </>
        ),
        children: [{ index: true, Component: () => <h1>Untitled page</h1> }],
      },
    ]);

    render(<Routes initialEntries={['/']} />);

    await screen.findByRole('heading', { name: 'Untitled page' });
    const titles = [...document.head.querySelectorAll('title')].map((title) => title.textContent);
    expect(titles).toEqual([`${serviceName} - GOV.UK`]);
  });
});

describe('RootErrorBoundary', () => {
  function renderError(status: number) {
    const Routes = createRoutesStub([
      {
        path: '/',
        meta: rootMeta,
        loader: () => {
          throw new Response('<html>403 Forbidden</html>', { status });
        },
        HydrateFallback: () => null,
        Component: () => <h1>Search</h1>,
        ErrorBoundary: () => (
          <>
            <Meta />
            <RootErrorBoundary audience="Public" navigation={[]} />
          </>
        ),
      },
    ]);
    render(<Routes initialEntries={['/']} />);
  }

  it('says when the gateway blocked the request, and what can cause it', async () => {
    renderError(403);

    await screen.findByRole('heading', { level: 1, name: 'Sorry, this request was blocked' });
    expect(
      screen.getByText(
        'Our security checks blocked this request. This can happen when a search includes characters such as <, > or two hyphens together (--). Remove them and try again.',
      ),
    ).toBeTruthy();
    expect([...document.head.querySelectorAll('title')].map((title) => title.textContent)).toEqual([
      `Sorry, this request was blocked - ${serviceName} - GOV.UK`,
    ]);
  });

  it('shows the service problem page for any other error', async () => {
    renderError(500);

    await screen.findByRole('heading', {
      level: 1,
      name: 'Sorry, there is a problem with the service',
    });
    expect(screen.getByText('Try again later.')).toBeTruthy();
  });
});
