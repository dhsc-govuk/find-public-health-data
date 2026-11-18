import { describe, expect, it } from 'vitest';

import { isRevisionsJourney, journeyFrom, journeySearch } from './query.ts';

function journeyAt(search: string) {
  return journeyFrom(new URL(`https://internal.test/review/date${search}`));
}

describe('the review journey', () => {
  it('reads the submission, kind and date the address carries', () => {
    expect(journeyAt('?submission=2&kind=minor_revisions&reviewedOn=2026-10-29')).toEqual({
      submissionNumber: 2,
      kind: 'minor_revisions',
      imrgReviewedOn: '2026-10-29',
    });
  });

  it.each([
    ['no submission', '?kind=approved'],
    ['a submission that is not a number', '?submission=two'],
    ['a submission of 0', '?submission=0'],
    ['a submission given twice', '?submission=1&submission=2'],
    ['an unknown kind', '?submission=1&kind=rejected'],
    ['a date that is not YYYY-MM-DD', '?submission=1&reviewedOn=29/10/2026'],
  ])('reads none from an address with %s', (_, search) => {
    expect(journeyAt(search)).toBeUndefined();
  });

  it('writes the journey back to a query string the next page reads', () => {
    const journey = {
      submissionNumber: 3,
      kind: 'approved' as const,
      imrgReviewedOn: '2026-10-01',
    };

    expect(journeySearch(journey)).toBe('?submission=3&kind=approved&reviewedOn=2026-10-01');
    expect(journeyAt(journeySearch(journey))).toEqual(journey);
  });

  it.each([
    [{ submissionNumber: 1, kind: 'pre_imrg_feedback' as const }, true],
    [{ submissionNumber: 1, kind: 'minor_revisions' as const, imrgReviewedOn: '2026-10-01' }, true],
    [{ submissionNumber: 1, kind: 'minor_revisions' as const }, false],
    [
      { submissionNumber: 1, kind: 'pre_imrg_feedback' as const, imrgReviewedOn: '2026-10-01' },
      false,
    ],
    [{ submissionNumber: 1, kind: 'approved' as const, imrgReviewedOn: '2026-10-01' }, false],
    [{ submissionNumber: 1 }, false],
  ])('lets the revisions page take %o: %s', (journey, expected) => {
    expect(isRevisionsJourney(journey)).toBe(expected);
  });
});
