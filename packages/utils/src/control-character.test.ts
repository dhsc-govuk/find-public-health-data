import { describe, expect, it } from 'vitest';

import { CONTROL_CHARACTER, CONTROL_CHARACTER_BUT_NEWLINE_OR_TAB } from './control-character.ts';

describe('CONTROL_CHARACTER', () => {
  it.each(['\u0000', 'a\u0001b', '\t', '\n', '\u007f', '\u0085', '\u009f'])(
    'finds one in %j',
    (text) => {
      expect(CONTROL_CHARACTER.test(text)).toBe(true);
    },
  );

  it.each(['', 'Plain text', 'Ünïcödé 😀', ' ', '​', ' '])('finds none in %j', (text) => {
    expect(CONTROL_CHARACTER.test(text)).toBe(false);
  });
});

describe('CONTROL_CHARACTER_BUT_NEWLINE_OR_TAB', () => {
  it('lets newlines and tabs through and finds any other control character', () => {
    expect(CONTROL_CHARACTER_BUT_NEWLINE_OR_TAB.test('One\n\ttwo')).toBe(false);
    expect(CONTROL_CHARACTER_BUT_NEWLINE_OR_TAB.test('One\r\ntwo')).toBe(true);
    expect(CONTROL_CHARACTER_BUT_NEWLINE_OR_TAB.test('One\u0000two')).toBe(true);
  });
});
