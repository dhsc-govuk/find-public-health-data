// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub, Meta, Outlet } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { rootMeta } from './root-error-boundary.tsx';
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
