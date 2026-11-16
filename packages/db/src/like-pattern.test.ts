import { describe, expect, it } from 'vitest';

import { escapeLike } from './like-pattern.ts';

describe('escapeLike', () => {
  it('escapes the percent sign, the underscore and the backslash', () => {
    expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
  });

  it('leaves other text as it is', () => {
    expect(escapeLike('Life expectancy (years)')).toBe('Life expectancy (years)');
  });
});
