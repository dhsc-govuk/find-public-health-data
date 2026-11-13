import { z } from '@fphd/config/zod';
import { describe, expect, it } from 'vitest';

import { definitionAndRationaleSection as section } from './indicator-definition-and-rationale-contract.ts';
import { requireDetails, yesNoSchema } from './indicator-section-contract.ts';

describe('textSection', () => {
  it('gives an unanswered field to the form as empty text', () => {
    expect(section.formValues({ definition: 'A definition', rationale: null })).toEqual({
      definition: 'A definition',
      rationale: '',
    });
  });
});

describe('requireDetails', () => {
  const schema = requireDetails(
    z.object({
      answer: yesNoSchema('Select an answer'),
      detail: z.string().trim(),
      other: z.string().min(1, 'Enter the other'),
    }),
    [{ answer: 'answer', detail: 'detail', detailRequired: 'Enter the detail' }],
  );

  function issues(body: object) {
    return schema.safeParse(body).error?.issues.map(({ path, message }) => [path, message]);
  }

  it.each(['no', 'yes'])('accepts details beside %s', (answer) => {
    expect(issues({ answer, detail: 'A detail', other: 'x' })).toBeUndefined();
  });

  it('accepts no details beside a no', () => {
    expect(issues({ answer: 'no', detail: '', other: 'x' })).toBeUndefined();
  });

  it('refuses a yes with blank details', () => {
    expect(issues({ answer: 'yes', detail: '  ', other: 'x' })).toEqual([
      [['detail'], 'Enter the detail'],
    ]);
  });

  it('refuses the details beside the other refusals', () => {
    expect(issues({ answer: 'yes', detail: '', other: '' })).toEqual([
      [['other'], 'Enter the other'],
      [['detail'], 'Enter the detail'],
    ]);
  });

  describe('with details under each answer', () => {
    const eachAnswer = requireDetails(
      z.object({
        answer: yesNoSchema('Select an answer'),
        detail: z.string().trim(),
        reason: z.string().trim(),
      }),
      [
        { answer: 'answer', detail: 'detail', detailRequired: 'Enter the detail' },
        { answer: 'answer', detail: 'reason', detailRequired: 'Enter the reason', onAnswer: 'no' },
      ],
    );

    function eachAnswerIssues(body: object) {
      return eachAnswer.safeParse(body).error?.issues.map(({ path, message }) => [path, message]);
    }

    it.each([
      ['yes', 'detail', 'Enter the detail'],
      ['no', 'reason', 'Enter the reason'],
    ])('refuses a %s with blank %s alone', (answer, field, message) => {
      expect(eachAnswerIssues({ answer, detail: ' ', reason: '' })).toEqual([[[field], message]]);
    });

    it('accepts each answer with its own details only', () => {
      expect(eachAnswerIssues({ answer: 'yes', detail: 'A detail', reason: '' })).toBeUndefined();
      expect(eachAnswerIssues({ answer: 'no', detail: '', reason: 'A reason' })).toBeUndefined();
    });
  });

  it('refuses the details beside an unanswered question', () => {
    const twoQuestions = requireDetails(
      z.object({
        answer: yesNoSchema('Select an answer'),
        detail: z.string().trim(),
        second: yesNoSchema('Select a second answer'),
        secondDetail: z.string().trim(),
      }),
      [
        { answer: 'answer', detail: 'detail', detailRequired: 'Enter the detail' },
        { answer: 'second', detail: 'secondDetail', detailRequired: 'Enter the second detail' },
      ],
    );
    const result = twoQuestions.safeParse({
      answer: 'yes',
      detail: '',
      second: '',
      secondDetail: '',
    });

    expect(result.error?.issues.map(({ path, message }) => [path, message])).toEqual([
      [['second'], 'Select a second answer'],
      [['detail'], 'Enter the detail'],
    ]);
  });
});

describe('yesNoSchema', () => {
  it.each(['yes', 'no'])('accepts %s', (answer) => {
    expect(yesNoSchema('Select an answer').parse(answer)).toBe(answer);
  });

  it.each(['', 'not-applicable', true])('refuses %o with its message', (answer) => {
    expect(yesNoSchema('Select an answer').safeParse(answer).error?.issues[0]?.message).toBe(
      'Select an answer',
    );
  });
});
