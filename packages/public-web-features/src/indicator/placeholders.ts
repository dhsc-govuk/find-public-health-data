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
    case 'metadata-only':
      return '[Not shown in this preview]';
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

/**
 * Whether the detail is a preview's. Only a preview's detail lists the questions its draft leaves
 * unanswered, even when it leaves none; the public detail has no list.
 */
export function isPreview({ unanswered }: IndicatorPageDetail): boolean {
  return unanswered !== undefined;
}
