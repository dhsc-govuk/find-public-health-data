// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { IndicatorDiscardPage } from './page.tsx';

afterEach(cleanup);

const ID = '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b';
const DRAFT_UPDATED_AT = '2026-10-22T09:30:00.123Z';

function renderPage(indicatorStatus: 'new' | 'live' = 'new') {
  return render(
    <MemoryRouter initialEntries={[`/publish/indicators/${ID}/discard-draft`]}>
      <IndicatorDiscardPage
        id={ID}
        draftUpdatedAt={DRAFT_UPDATED_AT}
        indicatorStatus={indicatorStatus}
      />
    </MemoryRouter>,
  );
}

describe('IndicatorDiscardPage', () => {
  it.each([
    ['new', 'This indicator will be deleted. You cannot undo this.'],
    [
      'live',
      'The changes in this draft will be deleted. The live indicator will stay as it is. You cannot undo this.',
    ],
  ] as const)('asks to confirm, saying what discarding does to a %s indicator', (status, text) => {
    renderPage(status);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Are you sure you want to discard this draft?',
      }),
    ).toBeTruthy();
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('discards the draft shown by posting its last edit', () => {
    renderPage();

    const button = screen.getByRole('button', { name: 'Discard draft' });
    const form = button.closest('form');
    expect(button.className).toContain('govuk-button--warning');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe(`/publish/indicators/${ID}/discard-draft`);
    expect(form?.querySelector<HTMLInputElement>('input[name="draftUpdatedAt"]')?.value).toBe(
      DRAFT_UPDATED_AT,
    );
  });

  it('lets the publisher cancel, back to the overview', () => {
    renderPage();

    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe(
      `/dashboard/indicators/${ID}`,
    );
  });
});
