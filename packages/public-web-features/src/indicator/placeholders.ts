import type { IndicatorPageDetail, IndicatorQuestion } from './loader.ts';

/** What a preview shows for a question its draft hasn't answered yet. */
export const NOT_ENTERED_YET = '[Not entered yet]';

/**
 * What a preview shows in place of a section that needs data, or null when the data can be
 * shown. The public detail has no data state, so the public page always shows its data.
 */
export function dataPlaceholder({ dataState }: IndicatorPageDetail): string | null {
  switch (dataState) {
    case 'no-upload':
      return '[Not provided yet]';
    case 'read-models-missing':
      return "[Data isn't shown in the preview yet]";
    default:
      return null;
  }
}

/**
 * Whether a preview's draft leaves `question` unanswered. Only the list decides: a null unit on
 * the public page means the values have no unit.
 */
export function isUnanswered(
  { unanswered }: IndicatorPageDetail,
  question: IndicatorQuestion,
): boolean {
  return unanswered?.includes(question) ?? false;
}
