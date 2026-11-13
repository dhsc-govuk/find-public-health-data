// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal } from '../testing.ts';
import { UpdateSummaryPage } from './page.tsx';

afterEach(cleanup);

const TITLE = 'What is the summary of this update?';
const empty = { updateSummary: '', updateSummaryForReviewers: '' };

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof UpdateSummaryPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <UpdateSummaryPage {...noRefusal} values={empty} {...props} />
    </MemoryRouter>,
  );
}

function summaryField() {
  return screen.getByLabelText(
    'Update summary for consumer-facing indicator history',
  ) as HTMLTextAreaElement;
}

function reviewersField() {
  return screen.getByLabelText(
    'Additional summary information for internal reviewers (optional)',
  ) as HTMLTextAreaElement;
}

describe('UpdateSummaryPage', () => {
  it('asks for the summary and the information for reviewers under the page heading', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
    expect(summaryField().getAttribute('name')).toBe('updateSummary');
    expect(reviewersField().getAttribute('name')).toBe('updateSummaryForReviewers');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(document.title).toBe(`${TITLE} - ${serviceName} - GOV.UK`);
  });

  it('shows the answers it is given, so a draft can be revisited', () => {
    renderPage({
      values: {
        updateSummary: 'Added the 2024 data.',
        updateSummaryForReviewers: 'The 2023 values are unchanged.',
      },
    });

    expect(summaryField().value).toBe('Added the 2024 data.');
    expect(reviewersField().value).toBe('The 2023 values are unchanged.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('links a missing summary to its field, marking only that field', () => {
    renderPage({
      fieldErrors: { updateSummary: 'Enter a summary of this update' },
      values: { updateSummary: '', updateSummaryForReviewers: 'Kept' },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Enter a summary of this update', `#${summaryField().id}`],
    ]);
    expect(summaryField().className).toContain('govuk-textarea--error');
    expect(reviewersField().className).not.toContain('govuk-textarea--error');
    expect(reviewersField().value).toBe('Kept');
    expect(document.title).toBe(`Error: ${TITLE} - ${serviceName} - GOV.UK`);
  });
});
