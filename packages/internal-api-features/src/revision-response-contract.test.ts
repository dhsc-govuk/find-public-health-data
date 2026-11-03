import { describe, expect, it } from 'vitest';

import {
  type RevisionRequest,
  revisionResponseFormSchemaFor,
} from './revision-response-contract.ts';

const flagsAndClarification: RevisionRequest = {
  kind: 'minor_revisions',
  clarificationRequest: 'Which years?',
  flaggedTaskCount: 2,
};

function refusalOf(request: RevisionRequest, revisionResponse: string) {
  const result = revisionResponseFormSchemaFor(request).safeParse({ revisionResponse });
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe('revisionResponseFormSchemaFor', () => {
  it('takes the reply as typed, without its surrounding spaces', () => {
    const result = revisionResponseFormSchemaFor(flagsAndClarification).safeParse({
      revisionResponse: '  Checked the years  ',
    });

    expect(result.success && result.data).toEqual({ revisionResponse: 'Checked the years' });
  });

  it.each([
    [
      'flags and a clarification request',
      flagsAndClarification,
      'Enter your response to the requested revisions and clarification request',
    ],
    [
      'pre-IMRG flags and a clarification request',
      { ...flagsAndClarification, kind: 'pre_imrg_feedback' as const },
      'Enter your response to the advised revisions and clarification request',
    ],
    [
      'a clarification request alone',
      { ...flagsAndClarification, flaggedTaskCount: 0 },
      'Enter your response to the clarification request',
    ],
    [
      'flags alone',
      { ...flagsAndClarification, clarificationRequest: null },
      'Enter your response to the requested revisions',
    ],
    [
      'pre-IMRG flags alone',
      { ...flagsAndClarification, kind: 'pre_imrg_feedback' as const, clarificationRequest: null },
      'Enter your response to the advised revisions',
    ],
  ])('refuses an empty reply to %s, saying what to answer', (_case, request, message) => {
    expect(refusalOf(request, '   ')).toBe(message);
  });

  it('refuses a reply over 10,000 characters', () => {
    expect(refusalOf(flagsAndClarification, 'a'.repeat(10_001))).toBe(
      'Your response must be 10,000 characters or fewer',
    );
  });
});
