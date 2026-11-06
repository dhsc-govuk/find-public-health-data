import { describe, expect, it } from 'vitest';

import { notesByAuthor, overviewReviewerNotes } from './overview-reviewer-notes.ts';

const JAMIE = { id: '00000000-0000-7000-8000-0000000000a1', name: 'Jamie Evans' };
const ROBIN = { id: '00000000-0000-7000-8000-0000000000a2', name: 'Robin Shaw' };
const AVERY = { id: '00000000-0000-7000-8000-0000000000a3', name: 'Avery Clarke' };
const DREW = { id: '00000000-0000-7000-8000-0000000000a4', name: 'Drew Kaur' };

function note(n: number, author: typeof JAMIE) {
  return {
    id: `00000000-0000-7000-8000-0000000000e${n}`,
    text: `Note ${n}`,
    createdAt: '2026-11-03T10:15:00.000Z',
    updatedAt: '2026-11-03T10:15:00.000Z',
    version: 'a'.repeat(64),
    author,
  };
}

const notes = [note(5, DREW), note(4, JAMIE), note(3, AVERY), note(2, ROBIN), note(1, JAMIE)];

describe('notesByAuthor', () => {
  it('lists the assigned reviewers in their order, then those since unassigned by name', () => {
    expect(notesByAuthor(notes, [JAMIE, ROBIN], undefined)).toEqual([
      { author: JAMIE, notes: [note(4, JAMIE), note(1, JAMIE)] },
      { author: ROBIN, notes: [note(2, ROBIN)] },
      { author: AVERY, notes: [note(3, AVERY)] },
      { author: DREW, notes: [note(5, DREW)] },
    ]);
  });

  it('lists an assigned reviewer who has written nothing, with no notes', () => {
    expect(notesByAuthor([], [JAMIE, ROBIN], undefined)).toEqual([
      { author: JAMIE, notes: [] },
      { author: ROBIN, notes: [] },
    ]);
  });

  it("leaves out the writer's own notes", () => {
    expect(notesByAuthor([note(4, JAMIE), note(2, ROBIN)], [JAMIE, ROBIN], JAMIE.id)).toEqual([
      { author: ROBIN, notes: [note(2, ROBIN)] },
    ]);
  });
});

describe('overviewReviewerNotes', () => {
  const url = new URL(`https://internal.test/dashboard/indicators/x?note=${note(2, ROBIN).id}`);

  it("gives the writer their own notes and a form that never edits another's", () => {
    const shown = overviewReviewerNotes(notes, [JAMIE, ROBIN], JAMIE.id, url);

    expect(shown.reviewerNotes).toEqual({
      notes: [note(4, JAMIE), note(1, JAMIE)],
      form: { values: { reviewerNote: '', noteId: '', version: '' }, fieldErrors: {} },
    });
    expect(shown.otherReviewerNotes.map(({ author }) => author)).toEqual([ROBIN, AVERY, DREW]);
  });

  it('gives a reader who does not write every note read only', () => {
    const shown = overviewReviewerNotes(notes, [JAMIE, ROBIN], undefined, url);

    expect(shown.reviewerNotes).toBeNull();
    expect(shown.otherReviewerNotes).toHaveLength(4);
  });

  it('shows nothing without the notes', () => {
    expect(overviewReviewerNotes(null, [JAMIE], JAMIE.id, url)).toEqual({
      reviewerNotes: null,
      otherReviewerNotes: [],
    });
  });
});
