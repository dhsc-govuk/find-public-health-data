import { describe, expect, it } from 'vitest';

import { reviewerNoteTextSchema } from './reviewer-notes-contract.ts';

function messageFor(text: string): string | undefined {
  const checked = reviewerNoteTextSchema.safeParse(text);
  return checked.success ? undefined : checked.error.issues[0]?.message;
}

describe('reviewerNoteTextSchema', () => {
  it.each([
    ['empty', ''],
    ['only spaces and newlines', '  \n\t '],
  ])('asks for notes when the text is %s', (_, text) => {
    expect(messageFor(text)).toBe('Enter your notes');
  });

  it('trims the ends and keeps the lines, as LF', () => {
    expect(reviewerNoteTextSchema.parse('  First line\r\nSecond line\n')).toBe(
      'First line\nSecond line',
    );
  });

  it('refuses more than 10,000 characters', () => {
    expect(messageFor('a'.repeat(10_001))).toBe('Notes must be 10,000 characters or fewer');
    expect(messageFor('a'.repeat(10_000))).toBeUndefined();
  });

  it('refuses hidden formatting characters', () => {
    expect(messageFor('Look\u0007 here')).toBe(
      'Notes must not include hidden formatting characters',
    );
  });
});
