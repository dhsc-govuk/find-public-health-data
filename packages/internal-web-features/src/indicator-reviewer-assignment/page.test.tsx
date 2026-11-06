// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { ADD_INTENT, removeIntent } from '../list-form.ts';
import { noRefusal } from '../testing.ts';
import type { ReviewerAssignmentValues } from './form.ts';
import { ReviewerAssignmentPage } from './page.tsx';

afterEach(cleanup);

const morgan = { id: '019fa38f-073f-764e-9ac6-1c4d03b20001', name: 'Morgan Hughes' };
const jamie = { id: '019fa38f-073f-764e-9ac6-1c4d03b20002', name: 'Jamie Evans' };
const alex = { id: '019fa38f-073f-764e-9ac6-1c4d03b20003', name: 'Alex Moore' };

const options = [
  { ...alex, assignedIndicatorCount: 0 },
  { ...jamie, assignedIndicatorCount: 1 },
  { ...morgan, assignedIndicatorCount: 3 },
];

const empty: ReviewerAssignmentValues = {
  submissionNumber: 2,
  previousReviewerIds: [],
  reviewerIds: [],
  addReviewer: '',
};

function renderPage(
  values: Partial<ReviewerAssignmentValues> = {},
  {
    currentReviewers = [],
    fieldErrors = {},
    offered = options,
  }: {
    currentReviewers?: { id: string; name: string }[];
    fieldErrors?: { addReviewer?: string };
    offered?: typeof options;
  } = {},
) {
  return render(
    <MemoryRouter>
      <ReviewerAssignmentPage
        {...noRefusal}
        currentReviewers={currentReviewers}
        fieldErrors={fieldErrors}
        options={offered}
        values={{ ...empty, ...values }}
      />
    </MemoryRouter>,
  );
}

function hiddenValues(name: string): string[] {
  return [
    ...document.querySelectorAll<HTMLInputElement>(`input[type="hidden"][name="${name}"]`),
  ].map((input) => input.value);
}

describe('ReviewerAssignmentPage', () => {
  it('is titled Assign reviewers', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Assign reviewers' })).toBeTruthy();
    expect(document.title).toBe(`Assign reviewers - ${serviceName} - GOV.UK`);
  });

  it('offers each reviewer with how many indicators they have assigned', () => {
    renderPage();

    const select = screen.getByRole('combobox', { name: 'Reviewer' });

    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Select',
      'Alex Moore (0 indicators currently assigned)',
      'Jamie Evans (1 indicator currently assigned)',
      'Morgan Hughes (3 indicators currently assigned)',
    ]);
  });

  it('adds the first reviewer with Add reviewer', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Add reviewer' }).getAttribute('value')).toBe(
      ADD_INTENT,
    );
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('lists the reviewers added, each removable, and leaves them out of the select', () => {
    renderPage({ reviewerIds: [morgan.id, jamie.id] });

    expect(
      screen
        .getAllByRole('listitem')
        .map((item) => item.querySelector('span:not(.govuk-visually-hidden)')?.textContent),
    ).toEqual(['Morgan Hughes', 'Jamie Evans']);
    expect(
      screen.getByRole('button', { name: 'Remove reviewer Jamie Evans' }).getAttribute('value'),
    ).toBe(removeIntent(1));
    expect(hiddenValues('reviewerIds')).toEqual([morgan.id, jamie.id]);
    expect(
      within(screen.getByRole('combobox', { name: 'Reviewer' }))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Select', 'Alex Moore (0 indicators currently assigned)']);
    expect(screen.getByRole('button', { name: 'Add reviewer' })).toBeTruthy();
  });

  it('offers no select once every reviewer is listed, keeping Continue', () => {
    renderPage({ reviewerIds: [alex.id, jamie.id, morgan.id] });

    expect(screen.queryByRole('combobox', { name: 'Reviewer' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Add/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Remove reviewer/ })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('says no reviewers are available when there is nobody to offer or list', () => {
    renderPage({}, { offered: [] });

    expect(screen.getByRole('heading', { level: 1, name: 'Assign reviewers' })).toBeTruthy();
    expect(
      screen.getByText('There are no reviewers available to assign to this indicator.'),
    ).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps the form for a listed reviewer when nobody else is on offer', () => {
    const departed = { id: '019fa38f-073f-764e-9ac6-1c4d03b20009', name: 'Sam Departed' };

    renderPage({ reviewerIds: [departed.id] }, { currentReviewers: [departed], offered: [] });

    expect(screen.queryByText(/no reviewers available/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('names a current reviewer who is no longer on offer', () => {
    const departed = { id: '019fa38f-073f-764e-9ac6-1c4d03b20009', name: 'Sam Departed' };

    renderPage({ reviewerIds: [departed.id] }, { currentReviewers: [departed] });

    expect(screen.getByRole('button', { name: 'Remove reviewer Sam Departed' })).toBeTruthy();
  });

  it('carries the submission and the reviewers the page first showed', () => {
    renderPage({ previousReviewerIds: [morgan.id], reviewerIds: [jamie.id] });

    expect(hiddenValues('submissionNumber')).toEqual(['2']);
    expect(hiddenValues('previousReviewerIds')).toEqual([morgan.id]);
  });

  it('summarises a refusal and marks the select', () => {
    renderPage({}, { fieldErrors: { addReviewer: 'Select a reviewer' } });

    expect(document.title).toBe(`Error: Assign reviewers - ${serviceName} - GOV.UK`);
    expect(
      within(screen.getByRole('alert'))
        .getByRole('link', { name: 'Select a reviewer' })
        .getAttribute('href'),
    ).toBe('#addReviewer-input');
  });
});
