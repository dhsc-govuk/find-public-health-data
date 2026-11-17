// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';

import { AppShell } from './app-shell.tsx';

afterEach(cleanup);

function renderShell({
  audience = 'Public',
  environmentName,
  feedbackMailbox,
}: {
  audience?: 'Public' | 'Internal';
  environmentName?: string;
  feedbackMailbox?: string;
} = {}) {
  render(
    <MemoryRouter>
      <AppShell
        audience={audience}
        environmentName={environmentName}
        feedbackMailbox={feedbackMailbox}
        navigation={[]}
      >
        <p>Page content</p>
      </AppShell>
    </MemoryRouter>,
  );
}

it('names the environment in a banner above the header', () => {
  renderShell({ environmentName: 'Dev' });

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

function phaseBanner() {
  const banner = screen.getByText('Beta').closest('.govuk-phase-banner');
  if (!(banner instanceof HTMLElement)) throw new Error('No phase banner');
  return banner;
}

it.each(['Public', 'Internal'] as const)(
  'asks for feedback at the feedback mailbox in the %s phase banner',
  (audience) => {
    renderShell({ audience, feedbackMailbox: 'feedback@example.com' });

    expect(phaseBanner().textContent).toBe(
      'BetaThis is a new service. You can help us to improve it by emailing feedback@example.com.',
    );
    expect(screen.getByRole('link', { name: 'feedback@example.com' }).getAttribute('href')).toBe(
      'mailto:feedback@example.com',
    );
  },
);

it('asks for feedback by emailing us when there is no feedback mailbox', () => {
  renderShell();

  expect(phaseBanner().textContent).toBe(
    'BetaThis is a new service. You can help us to improve it by emailing us.',
  );
  expect(screen.queryByRole('link', { name: /@/ })).toBeNull();
});
