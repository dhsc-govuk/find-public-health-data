import { describe, expect, it } from 'vitest';

import {
  imrgReviewDateSchemaFor,
  reviewApprovalSchema,
  reviewResponseBodySchema,
  reviewResponseSchemaFor,
  reviewResponseTypeSchema,
  updateApprovalSchema,
} from './review-response-contract.ts';

// 23:30 on 1 November 2026 in the UK, which is on GMT then; the UK date is the 1st.
const NOW = new Date('2026-11-01T23:30:00.000Z');
// 00:30 on 21 October 2026 in the UK, on BST, though the UTC date is still the 20th.
const FIRST_SUBMITTED_AT = new Date('2026-10-20T23:30:00.000Z');

function issues(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map(({ path, message }) => [path.join('.'), message]),
  );
}

describe('reviewResponseTypeSchema', () => {
  it('asks for the response type', () => {
    expect(issues(reviewResponseTypeSchema.safeParse({}))).toEqual({
      responseType: 'Select the response you are submitting',
    });
  });

  it.each(['pre_imrg_feedback', 'imrg_decision'])('accepts %s', (responseType) => {
    expect(reviewResponseTypeSchema.parse({ responseType })).toEqual({ responseType });
  });
});

describe('imrgReviewDateSchemaFor', () => {
  const schema = imrgReviewDateSchemaFor({ now: NOW, firstSubmittedAt: FIRST_SUBMITTED_AT });
  const date = (day: string, month: string, year: string) =>
    schema.safeParse({
      imrgReviewedOnDay: day,
      imrgReviewedOnMonth: month,
      imrgReviewedOnYear: year,
    });
  const onEveryPart = (message: string) => ({
    imrgReviewedOnDay: message,
    imrgReviewedOnMonth: message,
    imrgReviewedOnYear: message,
  });

  it('answers a date as YYYY-MM-DD', () => {
    expect(date(' 29 ', '10', '2026')).toEqual({
      success: true,
      data: { imrgReviewedOn: '2026-10-29' },
    });
  });

  it('asks for the date when none is given', () => {
    expect(issues(date('', '', ''))).toEqual(
      onEveryPart('Enter the date this indicator was reviewed by IMRG'),
    );
  });

  it('names the parts missing on each of them', () => {
    expect(issues(date('', '', '2026'))).toEqual({
      imrgReviewedOnDay: 'Date reviewed by IMRG must include a day and month',
      imrgReviewedOnMonth: 'Date reviewed by IMRG must include a day and month',
    });
    expect(issues(date('1', '10', ''))).toEqual({
      imrgReviewedOnYear: 'Date reviewed by IMRG must include a year',
    });
  });

  it('asks for a four-digit year', () => {
    expect(issues(date('1', '10', '26'))).toEqual({
      imrgReviewedOnYear: 'Year must include 4 numbers',
    });
  });

  it.each([
    ['a month that does not exist', '1', '13', '2026'],
    ['a day the month does not have', '31', '9', '2026'],
    ['a day that is not a number', 'first', '10', '2026'],
  ])('refuses %s', (_, day, month, year) => {
    expect(issues(date(day, month, year))).toEqual(
      onEveryPart('Date reviewed by IMRG must be a real date'),
    );
  });

  it('refuses a date after today in the UK', () => {
    expect(issues(date('2', '11', '2026'))).toEqual(
      onEveryPart('Date reviewed by IMRG must be today or in the past'),
    );
  });

  it('accepts today in the UK', () => {
    expect(date('1', '11', '2026').success).toBe(true);
  });

  it('refuses a date before the UK day the version was first submitted', () => {
    expect(issues(date('20', '10', '2026'))).toEqual(
      onEveryPart('Date reviewed by IMRG must be on or after 21 October 2026'),
    );
  });

  it('accepts the UK day the version was first submitted', () => {
    expect(date('21', '10', '2026').success).toBe(true);
  });
});

describe('reviewApprovalSchema', () => {
  it('asks whether the indicator was approved', () => {
    expect(issues(reviewApprovalSchema.safeParse({}))).toEqual({
      approved: 'Select whether this indicator was approved for publishing',
    });
  });

  it('asks for a reason when it was not', () => {
    expect(issues(reviewApprovalSchema.safeParse({ approved: 'no' }))).toEqual({
      revisionsKind: 'Select a reason',
    });
  });

  it.each([
    [{ approved: 'yes' }, 'approved'],
    [{ approved: 'yes', revisionsKind: 'major_revisions' }, 'approved'],
    [{ approved: 'no', revisionsKind: 'minor_revisions' }, 'minor_revisions'],
    [{ approved: 'no', revisionsKind: 'major_revisions' }, 'major_revisions'],
  ])('answers %o as %s', (answers, kind) => {
    expect(reviewApprovalSchema.parse(answers)).toEqual({ kind });
  });
});

describe('updateApprovalSchema', () => {
  it('asks whether the update is approved', () => {
    expect(issues(updateApprovalSchema.safeParse({ reasons: [] }))).toEqual({
      approved: 'Select whether you approve this update for publishing',
    });
  });

  it('asks for a kind of feedback when it is not', () => {
    expect(issues(updateApprovalSchema.safeParse({ approved: 'no', reasons: [] }))).toEqual({
      reasons: 'Select at least one kind of feedback',
    });
  });

  it.each([
    [{ approved: 'yes', reasons: [] }, { approved: true }],
    [{ approved: 'yes', reasons: ['revisions'] }, { approved: true }],
    [
      { approved: 'no', reasons: ['revisions', 'clarification'] },
      { approved: false, reasons: ['revisions', 'clarification'] },
    ],
  ])('answers %j as %j', (answers, decided) => {
    expect(updateApprovalSchema.parse(answers)).toEqual(decided);
  });
});

const feedback = {
  submissionNumber: 1,
  kind: 'pre_imrg_feedback',
  imrgReviewedOn: null,
  clarificationRequest: null,
  flags: [{ task: 'polarity', notes: 'Check it' }],
};
const decision = { ...feedback, kind: 'minor_revisions', imrgReviewedOn: '2026-10-29' };
const approval = { ...decision, kind: 'approved', flags: [] };

describe('reviewResponseBodySchema', () => {
  it.each([
    ['an approval with a flag', { ...approval, flags: feedback.flags }],
    ['an approval with a clarification request', { ...approval, clarificationRequest: 'Why?' }],
    ['pre-IMRG feedback with a date', { ...feedback, imrgReviewedOn: '2026-10-29' }],
    ['a task flagged twice', { ...feedback, flags: [...feedback.flags, ...feedback.flags] }],
    [
      'a task that cannot be flagged',
      { ...feedback, flags: [{ task: 'justifications', notes: 'x' }] },
    ],
    ['no submission number', { ...feedback, submissionNumber: undefined }],
  ])('refuses %s', (_, body) => {
    expect(reviewResponseBodySchema.safeParse(body).success).toBe(false);
  });

  it.each([
    ['feedback', feedback],
    ['a decision', decision],
    ['an approval', approval],
  ])('accepts %s', (_, body) => {
    expect(reviewResponseBodySchema.safeParse(body).success).toBe(true);
  });
});

describe('reviewResponseSchemaFor', () => {
  const schema = reviewResponseSchemaFor(NOW);

  it('trims the text it answers', () => {
    expect(
      schema.parse({
        ...decision,
        clarificationRequest: '  What is counted?\r\n',
        flags: [{ task: 'data-table', notes: ' Add 2024 ' }],
      }),
    ).toEqual({
      ...decision,
      clarificationRequest: 'What is counted?',
      flags: [{ task: 'data-table', notes: 'Add 2024' }],
    });
  });

  it('accepts an approval dated today in the UK', () => {
    expect(schema.parse({ ...approval, imrgReviewedOn: '2026-11-01' })).toEqual({
      ...approval,
      imrgReviewedOn: '2026-11-01',
    });
  });

  it('accepts an approval with no date, as an update is approved', () => {
    expect(schema.parse({ ...approval, imrgReviewedOn: null })).toEqual({
      ...approval,
      imrgReviewedOn: null,
    });
  });

  it('refuses an approval dated after today', () => {
    expect(issues(schema.safeParse({ ...approval, imrgReviewedOn: '2026-11-02' }))).toEqual({
      imrgReviewedOn: 'Date reviewed by IMRG must be today or in the past',
    });
  });

  it.each([
    ['no date', null, 'Enter the date this indicator was reviewed by IMRG'],
    ['a date that does not exist', '2026-02-30', 'Date reviewed by IMRG must be a real date'],
    ['a date that is not one', '29/10/2026', 'Date reviewed by IMRG must be a real date'],
    ['a date after today', '2026-11-02', 'Date reviewed by IMRG must be today or in the past'],
  ])('refuses a decision with %s', (_, imrgReviewedOn, message) => {
    expect(issues(schema.safeParse({ ...decision, imrgReviewedOn }))).toEqual({
      imrgReviewedOn: message,
    });
  });

  it.each([
    ['feedback', feedback],
    ['revisions', decision],
  ])('asks for a flag or a clarification request on %s', (_, body) => {
    expect(issues(schema.safeParse({ ...body, flags: [] }))).toEqual({
      flags: 'Select what needs to be revised or clarified',
    });
  });

  it('accepts a clarification request alone', () => {
    expect(
      schema.safeParse({ ...feedback, flags: [], clarificationRequest: 'What is counted?' })
        .success,
    ).toBe(true);
  });

  it('asks what the clarification is about when it is asked for but empty', () => {
    expect(issues(schema.safeParse({ ...feedback, clarificationRequest: '  ' }))).toEqual({
      clarificationRequest: 'Enter what you are requesting clarification about',
    });
  });

  it.each([
    ['feedback', feedback, 'Enter the revisions advised for how the indicator was calculated'],
    ['revisions', decision, 'Enter the revisions needed for how the indicator was calculated'],
  ])('asks for the notes of a flag without any, on %s', (_, body, message) => {
    expect(
      issues(schema.safeParse({ ...body, flags: [{ task: 'calculation', notes: ' ' }] })),
    ).toEqual({ 'flags.calculation': message });
  });

  it('limits the notes as a textarea is limited', () => {
    expect(
      issues(
        schema.safeParse({ ...decision, flags: [{ task: 'name', notes: 'x'.repeat(10_001) }] }),
      ),
    ).toEqual({ 'flags.name': 'Revisions for name must be 10,000 characters or fewer' });
  });
});
