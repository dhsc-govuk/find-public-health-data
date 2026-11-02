import { describe, expect, it } from 'vitest';

import {
  approvalValuesFrom,
  dateValuesFrom,
  readRevisions,
  responseTypeFrom,
  revisionsBody,
} from './form.ts';

function formData(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe('the review response forms', () => {
  it('reopens each page with the answer the journey carries', () => {
    expect(responseTypeFrom({ submissionNumber: 1, kind: 'pre_imrg_feedback' })).toBe(
      'pre_imrg_feedback',
    );
    expect(responseTypeFrom({ submissionNumber: 1, imrgReviewedOn: '2026-10-01' })).toBe(
      'imrg_decision',
    );
    expect(responseTypeFrom(undefined)).toBe('');
    expect(dateValuesFrom({ submissionNumber: 1, imrgReviewedOn: '2026-09-04' })).toEqual({
      imrgReviewedOnDay: '4',
      imrgReviewedOnMonth: '9',
      imrgReviewedOnYear: '2026',
    });
    expect(approvalValuesFrom({ submissionNumber: 1, kind: 'major_revisions' })).toEqual({
      approved: 'no',
      revisionsKind: 'major_revisions',
    });
  });

  it('reads what is ticked on the revisions page, and the text under each box ticked', () => {
    const values = readRevisions(
      formData([
        ['clarification', 'yes'],
        ['clarificationRequest', 'What is counted?'],
        ['flags', 'polarity'],
        ['flags.polarity', 'Higher is better'],
        ['flags.name', 'Not ticked, so not read'],
      ]),
    );

    expect(values).toEqual({
      clarification: true,
      clarificationRequest: 'What is counted?',
      flags: ['polarity'],
      notes: { polarity: 'Higher is better' },
    });
    expect(
      revisionsBody(
        { submissionNumber: 2, kind: 'minor_revisions', imrgReviewedOn: '2026-10-01' },
        values,
      ),
    ).toEqual({
      submissionNumber: 2,
      kind: 'minor_revisions',
      imrgReviewedOn: '2026-10-01',
      clarificationRequest: 'What is counted?',
      flags: [{ task: 'polarity', notes: 'Higher is better' }],
    });
  });

  it('sends no clarification request while its box is unticked, whatever was typed', () => {
    const values = readRevisions(formData([['clarificationRequest', 'Typed, then unticked']]));

    expect(revisionsBody({ submissionNumber: 1, kind: 'pre_imrg_feedback' }, values)).toMatchObject(
      {
        imrgReviewedOn: null,
        clarificationRequest: null,
        flags: [],
      },
    );
  });

  it('refuses a box the page never offers', () => {
    expect(() => readRevisions(formData([['flags', 'justifications']]))).toThrow(Response);
  });
});
