import { expect, it } from 'vitest';
import { sourceUpdateFrequency } from './frequency.ts';

it('leaves an absent frequency unanswered', () =>
  expect(sourceUpdateFrequency(null, null)).toBeNull());
it('reads each indicator structured setting', () =>
  expect(sourceUpdateFrequency('Quarterly (not yet in use)', null)).toBe('quarterly'));
it.each([
  ['Annual', 'annually'],
  ['The data will be updated annually.', 'annually'],
  ['Quarterly', 'quarterly'],
  ['Monthly', 'monthly'],
  ['Every 2 years', 'every-2-years'],
] as const)('translates unambiguous prose %s', (prose, expected) =>
  expect(sourceUpdateFrequency(null, prose)).toBe(expected),
);
it.each(['Every 3 years', 'Quarterly and annually'])(
  'leaves unsupported or mixed prose for review: %s',
  (prose) => expect(sourceUpdateFrequency(null, prose)).toBeNull(),
);
it('refuses a conflict between structured and prose frequency', () =>
  expect(() => sourceUpdateFrequency('Annual', 'Quarterly')).toThrow(
    'Conflicting source update frequencies',
  ));
