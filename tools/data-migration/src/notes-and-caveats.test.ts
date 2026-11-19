import { describe, expect, it } from 'vitest';

import {
  NOTES_AND_CAVEATS_COLUMNS,
  normalise,
  notesAndCaveats,
  VOCABULARY,
} from './notes-and-caveats.ts';

describe('notesAndCaveats', () => {
  it('keeps each prose as the detail of a yes', () => {
    expect(
      notesAndCaveats({
        disclosureControl: ' Counts under 5 are suppressed.\n',
        caveats: 'Survey data.',
        notes: 'Revised in 2024.',
      }),
    ).toEqual({
      disclosure_control: 'yes',
      disclosure_control_detail: 'Counts under 5 are suppressed.',
      has_rounding: null,
      rounding_detail: null,
      has_caveats: true,
      caveats_detail: 'Survey data.',
      has_other_notes: true,
      other_notes_detail: 'Revised in 2024.',
    });
  });

  it('leaves a question with blank or missing prose unanswered', () => {
    expect(notesAndCaveats({ disclosureControl: ' \n', caveats: null })).toEqual({
      disclosure_control: null,
      disclosure_control_detail: null,
      has_rounding: null,
      rounding_detail: null,
      has_caveats: null,
      caveats_detail: null,
      has_other_notes: null,
      other_notes_detail: null,
    });
  });

  it.each([
    'None applied',
    'Not applied',
    'None',
    'None required',
    'None needed',
    'Not required',
    'No disclosure control applied',
    'No disclosure control required',
    'No disclosure control was required',
    'No disclosure control applied. Data source is in the public domain.',
  ])('answers no to disclosure_control prose that says none was applied: %s', (prose) => {
    const result = notesAndCaveats({ disclosureControl: prose });
    expect(result.disclosure_control).toBe('no');
    expect(result.disclosure_control_detail).toBeNull();
  });

  it.each(['Not applicable', 'N/A', 'n/a.'])(
    'answers not-applicable to prose that says so: %s',
    (prose) => {
      const result = notesAndCaveats({ disclosureControl: prose });
      expect(result.disclosure_control).toBe('not-applicable');
      expect(result.disclosure_control_detail).toBeNull();
    },
  );

  it('answers no to caveats and notes of none', () => {
    const result = notesAndCaveats({ caveats: 'None.', notes: 'N/A' });
    expect(result.has_caveats).toBe(false);
    expect(result.has_other_notes).toBe(false);
  });

  it('matches once markup, spacing, case and one trailing full stop are set aside', () => {
    expect(normalise('<p>None\n  Applied.</p>')).toBe('none applied');
    expect(normalise('None applied..')).toBe('none applied.');
    const result = notesAndCaveats({ disclosureControl: '<p>None  applied.</p>' });
    expect(result.disclosure_control).toBe('no');
  });

  it.each([
    'Not required. Data is already in the public domain and suppressed at source.',
    'Not applicable, however values for Isles of Scilly will be suppressed.',
    'Not applied. Data are publicly available on the ONS website.',
    'None applied..',
    'Nothing',
  ])('keeps other prose as the detail of a yes: %s', (prose) => {
    const result = notesAndCaveats({ disclosureControl: prose });
    expect(result.disclosure_control).toBe('yes');
    expect(result.disclosure_control_detail).toBe(prose);
  });

  it('answers caveats with disclosure-control vocabulary words as a yes', () => {
    const result = notesAndCaveats({ caveats: 'Not applied' });
    expect(result.has_caveats).toBe(true);
  });

  it('leaves a question unanswered when its prose is only markup and spacing', () => {
    const result = notesAndCaveats({ caveats: '\n&nbsp;', notes: '<p></p>' });
    expect(result.has_caveats).toBeNull();
    expect(result.caveats_detail).toBeNull();
    expect(result.has_other_notes).toBeNull();
  });

  it('keeps the detail as plain text', () => {
    expect(notesAndCaveats({ caveats: '<p>Rates &ge; 5 per&nbsp;100,000</p>' })).toMatchObject({
      has_caveats: true,
      caveats_detail: 'Rates ≥ 5 per 100,000',
    });
  });

  it('recognises a stock answer written with markup and entities', () => {
    expect(notesAndCaveats({ disclosureControl: '<p>Not&nbsp;applied.</p>' })).toMatchObject({
      disclosure_control: 'no',
      disclosure_control_detail: null,
    });
  });

  it('holds its vocabulary already normalised', () => {
    for (const [, prose] of VOCABULARY) {
      expect(normalise(prose)).toBe(prose);
    }
  });
});

describe('NOTES_AND_CAVEATS_COLUMNS', () => {
  it('lists the eight answer columns in declaration order', () => {
    expect(NOTES_AND_CAVEATS_COLUMNS).toEqual([
      'disclosure_control',
      'disclosure_control_detail',
      'has_rounding',
      'rounding_detail',
      'has_caveats',
      'caveats_detail',
      'has_other_notes',
      'other_notes_detail',
    ]);
  });
});
