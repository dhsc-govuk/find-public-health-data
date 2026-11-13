// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { ApprovalPage, ResponseTypePage, ReviewDatePage, RevisionsPage } from './pages.tsx';

afterEach(cleanup);

const recap = { name: 'Hip fractures', scheduledPublishAt: '2027-04-01T08:30:00.000Z' };
const noRevisions = { clarification: false, clarificationRequest: '', flags: [], notes: {} };

function inRouter(page: React.ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

describe('the response pages', () => {
  it('ask the response type as the page heading, carrying the submission shown', () => {
    inRouter(
      <ResponseTypePage
        fieldErrors={{}}
        formError={undefined}
        submissionNumber={2}
        values={{ responseType: '' }}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'What response are you submitting?' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Pre-IMRG meeting feedback')).toBeTruthy();
    expect(screen.getByLabelText('IMRG review decision')).toBeTruthy();
    expect(document.querySelector('input[name="submissionNumber"]')?.getAttribute('value')).toBe(
      '2',
    );
  });

  it('recap the indicator above the date, with its publication date in UK time', () => {
    inRouter(
      <ReviewDatePage
        fieldErrors={{}}
        formError={undefined}
        recap={recap}
        values={{ imrgReviewedOnDay: '', imrgReviewedOnMonth: '', imrgReviewedOnYear: '' }}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'When was this indicator reviewed by IMRG?' }),
    ).toBeTruthy();
    expect(
      [...document.querySelectorAll('.govuk-list li')].map((item) => item.textContent),
    ).toEqual([
      'Indicator name: Hip fractures',
      'Scheduled publication date: 1 April 2027 at 9:30am',
    ]);
    expect(screen.getByText(/For example, 14 9 2026/)).toBeTruthy();
  });

  it('list a date error once in the summary, linked to the day', () => {
    const message = 'Date reviewed by IMRG must be a real date';
    inRouter(
      <ReviewDatePage
        fieldErrors={{
          imrgReviewedOnDay: message,
          imrgReviewedOnMonth: message,
          imrgReviewedOnYear: message,
        }}
        formError={undefined}
        recap={recap}
        values={{ imrgReviewedOnDay: '31', imrgReviewedOnMonth: '9', imrgReviewedOnYear: '2026' }}
      />,
    );

    const links = screen.getByRole('alert').querySelectorAll('a');
    expect([...links].map((link) => link.textContent)).toEqual([message]);
  });

  it('reveal the reasons under No on the approval page', () => {
    inRouter(
      <ApprovalPage
        fieldErrors={{ revisionsKind: 'Select a reason' }}
        formError={undefined}
        recap={recap}
        values={{ approved: 'no', revisionsKind: '' }}
      />,
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Was this indicator approved for publishing?',
      }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Minor revisions needed')).toBeTruthy();
    expect(screen.getByLabelText('Major revisions needed')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Select a reason');
  });

  it('offer every task but the notes for reviewers, grouped as the task list groups them', () => {
    inRouter(
      <RevisionsPage
        fieldErrors={{}}
        formError={undefined}
        isUpdate={false}
        kind="minor_revisions"
        values={noRevisions}
      />,
    );

    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Indicator',
      'Data',
      'Metadata',
      'Publishing',
    ]);
    expect(document.querySelectorAll('input[name="flags"]')).toHaveLength(19);
    expect(screen.queryByLabelText('Justifications')).toBeNull();
    expect(screen.getByLabelText('High-level clarification request')).toBeTruthy();
    expect(screen.getAllByLabelText('Enter required revisions')).toHaveLength(19);
  });

  it('offer the update summary under Publishing on an update', () => {
    inRouter(
      <RevisionsPage
        fieldErrors={{}}
        formError={undefined}
        isUpdate
        kind="pre_imrg_feedback"
        values={noRevisions}
      />,
    );

    const publishing = screen.getByRole('group', { name: 'Publishing' });
    expect(
      Array.from(publishing.querySelectorAll('input[name="flags"]'), (input) =>
        input.getAttribute('value'),
      ),
    ).toEqual(['update-frequency', 'publishing-date', 'update-summary']);
    expect(screen.getByLabelText('Update summary')).toBeTruthy();
  });

  it('offer no update summary on a new indicator', () => {
    inRouter(
      <RevisionsPage
        fieldErrors={{}}
        formError={undefined}
        isUpdate={false}
        kind="pre_imrg_feedback"
        values={noRevisions}
      />,
    );

    expect(screen.queryByLabelText('Update summary')).toBeNull();
  });

  it('word the notes as advice for feedback before the meeting', () => {
    inRouter(
      <RevisionsPage
        fieldErrors={{}}
        formError={undefined}
        isUpdate={false}
        kind="pre_imrg_feedback"
        values={noRevisions}
      />,
    );

    expect(
      screen.getAllByLabelText('Enter advised revisions or clarification request'),
    ).toHaveLength(19);
  });

  it('keep what was ticked and typed after a refusal, and link a flag error to its notes', () => {
    const message = 'Enter the revisions needed for polarity';
    inRouter(
      <RevisionsPage
        fieldErrors={{ 'flags.polarity': message }}
        formError={undefined}
        isUpdate={false}
        kind="minor_revisions"
        values={{
          ...noRevisions,
          flags: ['polarity', 'name'],
          notes: { polarity: '', name: 'Shorter' },
        }}
      />,
    );

    expect((screen.getByLabelText('Polarity') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByDisplayValue('Shorter')).toBeTruthy();
    expect(screen.getByRole('link', { name: message }).getAttribute('href')).toBe(
      '#flags.polarity-input',
    );
  });
});
