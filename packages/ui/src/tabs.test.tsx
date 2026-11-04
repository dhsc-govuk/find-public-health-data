// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, type LoaderFunction, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { Tabs } from './tabs.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

function renderTabs(
  waitForNavigation = false,
  loader?: LoaderFunction,
  defaultParam?: string,
  history?: 'push' | 'replace',
) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        ...(loader ? { loader } : {}),
        element: (
          <Tabs
            history={history ?? 'replace'}
            waitForNavigation={waitForNavigation}
            defaultParam={defaultParam}
            paramKey="panel"
            items={[
              { id: 'first', param: 'first', label: 'First', content: 'First panel' },
              { id: 'second', param: 'second', label: 'Second', content: 'Second panel' },
            ]}
          />
        ),
      },
    ],
    { initialEntries: [`/${window.location.hash}`] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

it('opens the requested default tab and can navigate back to the first', async () => {
  const router = renderTabs(false, undefined, 'second');
  expect(screen.getByRole('tab', { name: 'Second' }).getAttribute('aria-selected')).toBe('true');
  await act(async () => {
    fireEvent.click(screen.getByRole('tab', { name: 'First' }));
  });
  expect(router.state.location.search).toBe('?panel=first');
  expect(screen.getByRole('tab', { name: 'First' }).getAttribute('aria-selected')).toBe('true');
});

it('follows a tab parameter changed by another page control', async () => {
  const router = renderTabs();
  await act(async () => {
    await router.navigate('/?panel=second');
  });
  expect(screen.getByRole('tab', { name: 'Second' }).getAttribute('aria-selected')).toBe('true');
  await act(async () => {
    await router.navigate('/');
  });
  expect(screen.getByRole('tab', { name: 'First' }).getAttribute('aria-selected')).toBe('true');
});

it('preserves a legacy hash selection on hydration', () => {
  window.history.replaceState({}, '', '/#second');
  renderTabs();
  expect(screen.getByRole('tab', { name: 'Second' }).getAttribute('aria-selected')).toBe('true');
});

it('selects the requested tab immediately and marks its panel as loading until data arrives', async () => {
  let finish: (value: null) => void = () => {};
  const loaded = new Promise<null>((resolve) => {
    finish = resolve;
  });
  renderTabs(true, ({ request }) =>
    new URL(request.url).searchParams.get('panel') === 'second' ? loaded : null,
  );
  fireEvent.click(await screen.findByRole('tab', { name: 'Second' }));
  expect(screen.getByRole('tab', { name: 'Second' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel', { name: 'Second' }).getAttribute('aria-busy')).toBe('true');
  expect(screen.getByRole('status').textContent).toBe('Loading second…');
  const pendingContent = screen
    .getByRole('tabpanel', { name: 'Second' })
    .querySelector('.fphd-tabs__content');
  expect(pendingContent?.textContent).toBe('Second panel');
  expect(pendingContent?.getAttribute('aria-hidden')).toBe('true');
  expect(pendingContent?.hasAttribute('inert')).toBe(true);
  await act(async () => {
    finish(null);
  });
  expect(screen.getByRole('tab', { name: 'Second' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByRole('status')).toBeNull();
});

it('uses navigation links for tabs that need loader data without JavaScript', async () => {
  renderTabs(true);
  expect((await screen.findByRole('tab', { name: 'Second' })).getAttribute('href')).toBe(
    '?panel=second#second',
  );
});

it('keeps the current default panel mounted when its own options reload data', async () => {
  let finish: (value: null) => void = () => {};
  const held = new Promise<null>((resolve) => {
    finish = resolve;
  });
  const router = renderTabs(true, ({ request }) =>
    new URL(request.url).searchParams.has('option') ? held : null,
  );
  await screen.findByRole('tab', { name: 'First' });
  act(() => {
    void router.navigate('/?option=changed');
  });
  expect(
    screen.getByRole('tabpanel', { name: 'First' }).querySelector('.fphd-tabs__content')
      ?.textContent,
  ).toBe('First panel');
  expect(screen.queryByRole('status')).toBeNull();
  await act(async () => {
    finish(null);
  });
});

it('honours a legacy hash for navigation tabs and lets the next tab replace it', async () => {
  window.history.replaceState({}, '', '/#second');
  renderTabs(true);
  expect(screen.getByRole('tab', { name: 'Second' }).getAttribute('aria-selected')).toBe('true');
  await act(async () => {
    fireEvent.click(screen.getByRole('tab', { name: 'First' }));
  });
  expect(screen.getByRole('tab', { name: 'First' }).getAttribute('aria-selected')).toBe('true');
});

it('uses native Contents links and keeps every panel visible below the tablet breakpoint', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  renderTabs(true);
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.queryByRole('tab')).toBeNull();
  expect(screen.getByRole('link', { name: 'First' }).getAttribute('href')).toBe('#first');
  expect(screen.getByRole('link', { name: 'Second' }).getAttribute('href')).toBe('#second');
  expect(screen.getByText('First panel').closest('.govuk-tabs__panel')?.className).not.toContain(
    'panel--hidden',
  );
  expect(screen.getByText('Second panel').closest('.govuk-tabs__panel')?.className).not.toContain(
    'panel--hidden',
  );
});

it('restores tab semantics when crossing the standard breakpoint', () => {
  let resize: () => void = () => {};
  const media = {
    matches: false,
    addEventListener: (_event: string, listener: () => void) => {
      resize = listener;
    },
    removeEventListener: vi.fn(),
  };
  const matchMedia = vi.fn(() => media);
  vi.stubGlobal('matchMedia', matchMedia);
  renderTabs();
  expect(matchMedia).toHaveBeenCalledWith('(min-width: 40.0625em)');
  expect(screen.queryByRole('tablist')).toBeNull();
  act(() => {
    media.matches = true;
    resize();
  });
  expect(screen.getByRole('tab', { name: 'First' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByText('Second panel').closest('.govuk-tabs__panel')?.className).toContain(
    'govuk-tabs__panel--hidden',
  );
  act(() => {
    media.matches = false;
    resize();
  });
  expect(screen.queryByRole('tab')).toBeNull();
  expect(screen.getByText('Second panel').closest('.govuk-tabs__panel')?.className).not.toContain(
    'panel--hidden',
  );
});

it.each(['replace', 'push'] as const)(
  'uses explicit %s history for tab navigation',
  async (history) => {
    const router = renderTabs(false, undefined, undefined, history);
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: 'Second' })));
    expect(router.state.historyAction).toBe(history.toUpperCase());
  },
);
