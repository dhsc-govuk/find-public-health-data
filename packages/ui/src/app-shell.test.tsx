// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';

import { AppShell } from './app-shell.tsx';

afterEach(cleanup);

function renderShell(environmentName?: string) {
  render(
    <MemoryRouter>
      <AppShell audience="Public" environmentName={environmentName} navigation={[]}>
        <p>Page content</p>
      </AppShell>
    </MemoryRouter>,
  );
}

it('names the environment in a banner above the header', () => {
  renderShell('Dev');

  const banner = screen.getByRole('region', { name: 'Environment' });
  expect(banner.textContent).toBe(
    'DevThis version of Find public health data is only used for testing. No changes will appear on the live site.',
  );
  expect(
    banner.compareDocumentPosition(screen.getByRole('banner')) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('shows no environment banner when there is no environment to name', () => {
  renderShell();

  expect(screen.queryByRole('region', { name: 'Environment' })).toBeNull();
  expect(screen.getByText('Page content')).toBeTruthy();
});
