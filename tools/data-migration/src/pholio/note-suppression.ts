// Numeric masking is independent of a note's display category.
export const MASKED_SOURCE_NOTE_IDS: ReadonlySet<number> = new Set([
  100, 101, 102, 103, 128, 146, 150, 151, 154, 162, 163, 175, 184, 228, 232, 305, 403, 555,
]);

export function suppressSourceMeasures(value: number | null, noteId: number): boolean {
  return (value === null || value === -1) && MASKED_SOURCE_NOTE_IDS.has(noteId);
}
