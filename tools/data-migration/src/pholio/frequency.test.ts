import { expect, it } from 'vitest';
import { sourceUpdateFrequency } from './frequency.ts';

it('leaves an absent frequency unanswered', () =>
  expect(sourceUpdateFrequency(null, null)).toBeNull());
it('reads each indicator structured setting', () =>
  expect(sourceUpdateFrequency('Quarterly (not yet in use)', null)).toBe('quarterly'));
it.each([
  ['Annual', 'annually'],
  ['The data will be updated annually.', 'annually'],
  ['The data will be updated monthly.', 'monthly'],
  ['The data are updated quarterly.', 'quarterly'],
  ['Updated quarterly.', 'quarterly'],
  ['Quarterly', 'quarterly'],
  ['Monthly', 'monthly'],
  ['Every 2 years', 'every-2-years'],
] as const)('translates unambiguous prose %s', (prose, expected) =>
  expect(sourceUpdateFrequency(null, prose)).toBe(expected),
);
it.each([
  'Every 3 years',
  'Quarterly and annually',
  'The data will be updated monthly and annually.',
  'The data are not updated monthly.',
])('uses only the structured setting for unsupported or mixed prose: %s', (prose) => {
  expect(sourceUpdateFrequency(null, prose)).toBeNull();
  expect(sourceUpdateFrequency('Annual', prose)).toBe('annually');
});
it.each([
  'The data will normally be updated annually.',
  'The indicator will be updated annually in the Sexual and Reproductive Health Profiles.',
  'Annual updates',
])('keeps the structured setting when prose is unrecognised: %s', (prose) => {
  expect(sourceUpdateFrequency('Annual', prose)).toBe('annually');
  expect(sourceUpdateFrequency(null, prose)).toBeNull();
});
it.each(['Quarterly', 'The data will be updated quarterly.', 'The data are updated monthly.'])(
  'refuses a conflict between structured and recognised prose frequency: %s',
  (prose) =>
    expect(() => sourceUpdateFrequency('Annual', prose)).toThrow(
      'Conflicting source update frequencies',
    ),
);
