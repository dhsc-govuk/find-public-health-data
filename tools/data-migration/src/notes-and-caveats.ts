import { plainTextFromHtml } from './plain-text.ts';

// Each entry: [question column, normalised prose, answer].
// Must stay in sync with the vocabulary in migration 0022_other-notes-and-caveats.sql.
export const VOCABULARY: readonly [string, string, string][] = [
  ['disclosure_control', 'none applied', 'no'],
  ['disclosure_control', 'not applied', 'no'],
  ['disclosure_control', 'none', 'no'],
  ['disclosure_control', 'none required', 'no'],
  ['disclosure_control', 'none needed', 'no'],
  ['disclosure_control', 'not required', 'no'],
  ['disclosure_control', 'no disclosure control applied', 'no'],
  ['disclosure_control', 'no disclosure control required', 'no'],
  ['disclosure_control', 'no disclosure control was required', 'no'],
  [
    'disclosure_control',
    'no disclosure control applied. data source is in the public domain',
    'no',
  ],
  ['disclosure_control', 'not applicable', 'not-applicable'],
  ['disclosure_control', 'n/a', 'not-applicable'],
  ['caveats', 'none', 'no'],
  ['caveats', 'n/a', 'no'],
  ['notes', 'none', 'no'],
  ['notes', 'n/a', 'no'],
];

export const NOTES_AND_CAVEATS_COLUMNS = [
  'disclosure_control',
  'disclosure_control_detail',
  'has_rounding',
  'rounding_detail',
  'has_caveats',
  'caveats_detail',
  'has_other_notes',
  'other_notes_detail',
] as const;

export function normalise(text: string): string {
  const stripped = text.replace(/<[^>]*>/g, ' ');
  const collapsed = stripped
    .replace(/[ \t\r\n]+/g, ' ')
    .trim()
    .toLowerCase();
  return collapsed.endsWith('.') ? collapsed.slice(0, -1) : collapsed;
}

function proseAnswer(source: string, text: string): string {
  const key = normalise(text);
  return VOCABULARY.find(([col, prose]) => col === source && prose === key)?.[2] ?? 'yes';
}

export interface NotesAndCaveatsResult {
  disclosure_control: string | null;
  disclosure_control_detail: string | null;
  has_rounding: null;
  rounding_detail: null;
  has_caveats: boolean | null;
  caveats_detail: string | null;
  has_other_notes: boolean | null;
  other_notes_detail: string | null;
}

// Pholio holds this prose as HTML, so answers and details are decided on its plain text.
export function notesAndCaveats(prose: {
  disclosureControl?: string | null;
  caveats?: string | null;
  notes?: string | null;
}): NotesAndCaveatsResult {
  const result: NotesAndCaveatsResult = {
    disclosure_control: null,
    disclosure_control_detail: null,
    has_rounding: null,
    rounding_detail: null,
    has_caveats: null,
    caveats_detail: null,
    has_other_notes: null,
    other_notes_detail: null,
  };

  const dc = plainTextFromHtml(prose.disclosureControl ?? '') || null;
  if (dc !== null) {
    const answer = proseAnswer('disclosure_control', dc);
    result.disclosure_control = answer;
    result.disclosure_control_detail = answer === 'yes' ? dc : null;
  }

  const cav = plainTextFromHtml(prose.caveats ?? '') || null;
  if (cav !== null) {
    const answer = proseAnswer('caveats', cav);
    result.has_caveats = answer === 'yes';
    result.caveats_detail = answer === 'yes' ? cav : null;
  }

  const notes = plainTextFromHtml(prose.notes ?? '') || null;
  if (notes !== null) {
    const answer = proseAnswer('notes', notes);
    result.has_other_notes = answer === 'yes';
    result.other_notes_detail = answer === 'yes' ? notes : null;
  }

  return result;
}
