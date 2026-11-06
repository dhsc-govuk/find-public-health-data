// @vitest-environment jsdom
import { TEAM_IDS } from '@fphd/auth';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { SHOWN_VERSION } from '../testing.ts';
import type {
  AuthorNotes,
  IndicatorAdminDetail,
  ReviewerNote,
  ReviewerNoteForm,
} from './loader.ts';
import { IndicatorOverviewPage } from './page.tsx';

afterEach(cleanup);

const indicator: IndicatorAdminDetail = {
  id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b',
  shortId: 90366,
  name: 'Life expectancy at birth',
  teamId: TEAM_IDS.teamA,
  publishedSlug: null,
  updatedAt: '2026-08-04T23:30:00.000Z',
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: false,
  draftSubmissionStatus: 'changes_requested',
  draftResponseKind: 'minor_revisions',
  draftReviewers: [],
  draftSubmissionNumber: 1,
  draftScheduledPublishAt: null,
  draftFirstSubmittedAt: '2026-11-02T09:00:00.000Z',
  draftResponse: { kind: 'minor_revisions', flaggedTaskCount: 1 },
  nameVersion: SHOWN_VERSION,
  actions: [],
};

const notes: ReviewerNote[] = [
  {
    id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4ae2',
    text: 'Ask about 2019\nand the dip after',
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:15:00.000Z',
    version: SHOWN_VERSION,
  },
  {
    id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4ae1',
    text: 'Numerator looks right',
    createdAt: '2026-11-02T14:00:00.000Z',
    updatedAt: '2026-11-02T14:00:00.000Z',
    version: SHOWN_VERSION,
  },
];

const adding: ReviewerNoteForm = {
  values: { reviewerNote: '', noteId: '', version: '' },
  fieldErrors: {},
};

const ROBIN = { id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4aa2', name: 'Robin Shaw' };
const AVERY = { id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4aa3', name: 'Avery Clarke' };

const others: AuthorNotes[] = [
  {
    author: ROBIN,
    notes: [
      {
        id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4ae3',
        text: 'Denominator source is fine',
        createdAt: '2026-11-04T09:00:00.000Z',
        updatedAt: '2026-11-04T09:30:00.000Z',
        version: SHOWN_VERSION,
        author: ROBIN,
      },
    ],
  },
  { author: AVERY, notes: [] },
];

function renderPage(
  shown: readonly ReviewerNote[] | null,
  form: ReviewerNoteForm = adding,
  isReviewer = shown !== null,
  otherReviewerNotes: readonly AuthorNotes[] = [],
) {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/indicators/${indicator.id}`]}>
      <IndicatorOverviewPage
        canEdit={false}
        indicator={indicator}
        isReviewer={isReviewer}
        reviewerNotes={shown === null ? null : { notes: shown, form }}
        otherReviewerNotes={otherReviewerNotes}
      />
    </MemoryRouter>,
  );
}

function reviewSection(): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name: 'Review' });
  if (heading.parentElement === null) throw new Error('the Review heading has no section');
  return heading.parentElement;
}

describe("the reviewer's notes", () => {
  it('lists them newest first under Your notes in the Review section, dated in UK time', () => {
    renderPage(notes);

    const review = within(reviewSection());
    expect(review.getByRole('heading', { level: 3, name: 'Your notes' })).toBeTruthy();
    const rows = review
      .getAllByRole('row')
      .map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['Date', 'Notes', 'Edit link'],
      [
        '3 November 2026 at 10:15am',
        'Ask about 2019\nand the dip after',
        'Edit the note from 3 November 2026 at 10:15am',
      ],
      [
        '2 November 2026 at 2:00pm',
        'Numerator looks right',
        'Edit the note from 2 November 2026 at 2:00pm',
      ],
    ]);
    const table = review.getByRole('table');
    expect(table.querySelector('.fphd-metadata-text')?.textContent).toBe(
      'Ask about 2019\nand the dip after',
    );
    expect(table.querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-03T10:15:00.000Z');
  });

  it('shows the heading with no table while the reviewer has none', () => {
    renderPage([]);

    const review = within(reviewSection());
    expect(review.getByRole('heading', { level: 3, name: 'Your notes' })).toBeTruthy();
    expect(review.queryByRole('table')).toBeNull();
  });

  it('takes the place of the no-actions text once the reviewer has responded', () => {
    renderPage([]);

    expect(screen.queryByText('There are no actions available for this indicator yet.')).toBeNull();
  });

  it('links each note to the overview with it in the form', () => {
    renderPage(notes);

    // jsdom joins the visually hidden text without its space, so the link is found by its text.
    const link = screen
      .getAllByRole('link')
      .find(({ textContent }) => textContent === 'Edit the note from 2 November 2026 at 2:00pm');

    expect(link?.getAttribute('href')).toBe(
      `/dashboard/indicators/${indicator.id}?note=019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4ae1#reviewerNote-input`,
    );
  });

  it('offers an empty form that adds a note', () => {
    renderPage([]);

    const textarea = screen.getByRole('textbox', {
      name: 'Enter any notes as part of your indicator review',
    });
    expect((textarea as HTMLTextAreaElement).value).toBe('');
    expect(textarea.getAttribute('name')).toBe('reviewerNote');
    const form = textarea.closest('form');
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.querySelectorAll('input[type="hidden"]')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Add notes' }).className).toContain(
      'govuk-button--secondary',
    );
  });

  it('fills the form with the note being edited, sending its id and version', () => {
    renderPage(notes, {
      values: {
        reviewerNote: 'Numerator looks right',
        noteId: notes[1]?.id ?? '',
        version: SHOWN_VERSION,
      },
      fieldErrors: {},
    });

    const textarea = screen.getByRole('textbox', {
      name: 'Enter any notes as part of your indicator review',
    }) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Numerator looks right');
    const hidden = [...(textarea.closest('form')?.querySelectorAll('input[type="hidden"]') ?? [])];
    expect(
      hidden.map((input) => [input.getAttribute('name'), input.getAttribute('value')]),
    ).toEqual([
      ['noteId', notes[1]?.id],
      ['version', SHOWN_VERSION],
    ]);
    expect(screen.getByRole('button', { name: 'Update notes' })).toBeTruthy();
  });

  it('shows a refused note in the error summary and on the field', () => {
    renderPage([], {
      values: { reviewerNote: ' ', noteId: '', version: '' },
      fieldErrors: { reviewerNote: 'Enter your notes' },
    });

    const summary = screen.getByRole('alert');
    expect(
      within(summary).getByRole('link', { name: 'Enter your notes' }).getAttribute('href'),
    ).toBe('#reviewerNote-input');
    expect(document.querySelector('#reviewerNote-error')?.textContent).toContain(
      'Enter your notes',
    );
  });

  it('shows a refusal that names no field in the error summary', () => {
    renderPage(notes, {
      values: { reviewerNote: 'Mine', noteId: notes[0]?.id ?? '', version: SHOWN_VERSION },
      fieldErrors: {},
      formError: 'This note has changed since you opened it. Check it, then edit it again.',
    });

    expect(within(screen.getByRole('alert')).getByText(/This note has changed/)).toBeTruthy();
  });

  it('shows nothing to someone who may not read them', () => {
    renderPage(null);

    expect(screen.queryByRole('heading', { name: 'Your notes' })).toBeNull();
    expect(screen.queryByRole('heading', { name: "Reviewers' notes" })).toBeNull();
  });
});

/** The rows of the table after the heading `name`, cell by cell. */
function tableAfter(name: string): (string | null)[][] {
  const section = screen.getByRole('heading', { level: 3, name }).parentElement;
  if (section === null) throw new Error(`the ${name} heading has no section`);
  return within(section)
    .getAllByRole('row')
    .map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent));
}

describe("other reviewers' notes", () => {
  it('follow the form in the Review section, read only, one section per reviewer', () => {
    renderPage(notes, adding, true, others);

    const review = within(reviewSection());
    expect(review.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Your notes',
      "Robin Shaw's notes",
      "Avery Clarke's notes",
    ]);
    expect(tableAfter("Robin Shaw's notes")).toEqual([
      ['Date', 'Notes'],
      ['4 November 2026 at 9:30am', 'Denominator source is fine'],
    ]);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: "Reviewers' notes" })).toBeNull();
  });

  it('say so for a reviewer who has written none', () => {
    renderPage(notes, adding, true, others);

    const avery = screen.getByRole('heading', { level: 3, name: "Avery Clarke's notes" });
    expect(within(avery.parentElement as HTMLElement).getByText('No notes added')).toBeTruthy();
  });

  it("go in a Reviewers' notes section, with no form, for a reader who is not reviewing", () => {
    renderPage(null, adding, false, others);

    const heading = screen.getByRole('heading', { level: 2, name: "Reviewers' notes" });
    const section = within(heading.parentElement as HTMLElement);
    expect(section.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      "Robin Shaw's notes",
      "Avery Clarke's notes",
    ]);
    expect(screen.queryByRole('heading', { name: 'Your notes' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('link', { name: /^Edit/ })).toBeNull();
  });
});
