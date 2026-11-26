import { describe, expect, it } from 'vitest';

import { notesAndCaveats } from '../notes-and-caveats.ts';

describe('notes and caveats from Pholio prose', () => {
  it('maps Pholio prose columns to the renamed indicator_version answer columns', () => {
    const result = notesAndCaveats({
      disclosureControl: '<p>Counts under 5 are suppressed.</p>',
      caveats: '<p>Survey data &mdash; use with care.</p>',
      notes: 'None.',
    });
    expect(result).toEqual({
      disclosure_control: 'yes',
      disclosure_control_detail: 'Counts under 5 are suppressed.',
      has_caveats: true,
      caveats_detail: 'Survey data — use with care.',
      has_other_notes: false,
      other_notes_detail: null,
    });
  });

  it('treats a caveats column that is only &nbsp; as unanswered (null)', () => {
    const result = notesAndCaveats({
      disclosureControl: null,
      caveats: '&nbsp;',
      notes: null,
    });
    expect(result.has_caveats).toBeNull();
    expect(result.caveats_detail).toBeNull();
  });

  it('produces null for all answer columns when all prose fields are absent', () => {
    const result = notesAndCaveats({ disclosureControl: null, caveats: null, notes: null });
    expect(result).toEqual({
      disclosure_control: null,
      disclosure_control_detail: null,
      has_caveats: null,
      caveats_detail: null,
      has_other_notes: null,
      other_notes_detail: null,
    });
  });
});
