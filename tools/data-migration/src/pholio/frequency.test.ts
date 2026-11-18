import { expect, it } from 'vitest';
import { sourceUpdateFrequency } from './frequency.ts';

const answer = (updateFrequency: string | null, updateFrequencyYears: number | null = null) => ({
  updateFrequency,
  updateFrequencyYears,
  updateFrequencyText: null,
});
const other = (updateFrequencyText: string) => ({
  updateFrequency: 'other',
  updateFrequencyYears: null,
  updateFrequencyText,
});

it('leaves an absent frequency unanswered', () =>
  expect(sourceUpdateFrequency(null, null)).toEqual(answer(null)));
it('reads each indicator structured setting', () =>
  expect(sourceUpdateFrequency('Quarterly (not yet in use)', null)).toEqual(answer('quarterly')));
it.each([
  ['Annual', 'annually'],
  ['The data will be updated annually.', 'annually'],
  ['The data will be updated monthly.', 'monthly'],
  ['The data are updated quarterly.', 'quarterly'],
  ['Updated quarterly.', 'quarterly'],
  ['Quarterly', 'quarterly'],
  ['Monthly', 'monthly'],
  ['No fixed frequency', 'no-fixed-frequency'],
  ['No longer updated', 'no-longer-updated'],
] as const)('translates unambiguous prose %s', (prose, expected) =>
  expect(sourceUpdateFrequency(null, prose)).toEqual(answer(expected)),
);
it.each([
  ['Every 2 years', 2],
  ['Every two years', 2],
  ['Every 3 years.', 3],
  ['Updated every five years', 5],
  ['The data will be updated every 10 years.', 10],
] as const)('translates prose %s into its number of years', (prose, years) =>
  expect(sourceUpdateFrequency(null, prose)).toEqual(answer('every-n-years', years)),
);
it.each([
  'Every 1 years',
  'Every 100 years',
  'Every few years',
  'Quarterly and annually',
  'The data will be updated monthly and annually.',
  'The data are not updated monthly.',
  'The data will normally be updated annually.',
  'The indicator will be updated annually in the Sexual and Reproductive Health Profiles.',
  'Annual updates',
])('keeps unrecognised prose as an other frequency, whatever the lookup: %s', (prose) => {
  expect(sourceUpdateFrequency(null, prose)).toEqual(other(prose));
  expect(sourceUpdateFrequency('Annual', prose)).toEqual(other(prose));
});
it.each(['Annual', null])('takes prose naming a number of years beside a lookup of %s', (lookup) =>
  expect(sourceUpdateFrequency(lookup, 'Every 3 years')).toEqual(answer('every-n-years', 3)),
);
it('refuses prose naming a number of years beside a quarterly lookup', () =>
  expect(() => sourceUpdateFrequency('Quarterly (not yet in use)', 'Every 3 years')).toThrow(
    'Conflicting source update frequencies',
  ));
it('keeps the prose as plain text', () =>
  expect(
    sourceUpdateFrequency('Annual', '<p>Academic year &amp; term time</p><p>Published.</p>'),
  ).toEqual(other('Academic year & term time\nPublished.')));
it.each(['', '  \n\t ', '<p>&nbsp;</p>'])(
  'uses the structured setting beside blank prose %j',
  (prose) => expect(sourceUpdateFrequency('Annual', prose)).toEqual(answer('annually')),
);
it.each(['Quarterly', 'The data will be updated quarterly.', 'The data are updated monthly.'])(
  'refuses a conflict between structured and recognised prose frequency: %s',
  (prose) =>
    expect(() => sourceUpdateFrequency('Annual', prose)).toThrow(
      'Conflicting source update frequencies',
    ),
);
