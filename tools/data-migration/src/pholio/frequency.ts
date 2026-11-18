import {
  UPDATE_FREQUENCY_MAX_YEARS,
  UPDATE_FREQUENCY_MIN_YEARS,
  type UpdateFrequency,
} from '@fphd/utils/update-frequency';
import { translateFrequency } from '../fingertips-lookups.ts';
import { plainTextFromHtml } from '../plain-text.ts';

/** An indicator's update frequency as the export writes it, with the details its answer has. */
export interface SourceUpdateFrequency {
  updateFrequency: UpdateFrequency | null;
  updateFrequencyYears: number | null;
  updateFrequencyText: string | null;
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function answer(
  updateFrequency: UpdateFrequency | null,
  updateFrequencyYears: number | null = null,
): SourceUpdateFrequency {
  return { updateFrequency, updateFrequencyYears, updateFrequencyText: null };
}

/** The answer that prose names unambiguously, or null when it names none. */
function describedFrequency(prose: string): SourceUpdateFrequency | null {
  const text = prose.toLowerCase().replace(/[.]$/, '');
  const description = text.replace(/^(?:(?:the )?data (?:will be|are) )?updated /, '');
  if (/^annual(?:ly)?$/.test(description)) return answer('annually');
  if (description === 'monthly') return answer('monthly');
  if (description === 'quarterly') return answer('quarterly');
  if (text === 'no fixed frequency') return answer('no-fixed-frequency');
  if (/^(this indicator will no longer be updated|no longer updated)$/.test(text))
    return answer('no-longer-updated');
  const every = /^every (\w+) years$/.exec(description)?.[1];
  const years = every === undefined ? undefined : (NUMBER_WORDS[every] ?? Number(every));
  if (
    years !== undefined &&
    Number.isInteger(years) &&
    years >= UPDATE_FREQUENCY_MIN_YEARS &&
    years <= UPDATE_FREQUENCY_MAX_YEARS
  )
    return answer('every-n-years', years);
  return null;
}

/**
 * The update frequency from Pholio's lookup and its frequency prose.
 *
 * - Prose that names an answer gives that answer, and must agree with the lookup. Pholio's lookup
 *   has no interval longer than Annual, so prose naming a number of years agrees with Annual.
 * - Any other prose becomes "Other" with the prose as its description, whatever the lookup says,
 *   so the public page keeps Pholio's wording.
 * - Without prose, the lookup gives the answer.
 */
export function sourceUpdateFrequency(
  lookup: string | null,
  prose: string | null,
): SourceUpdateFrequency {
  const structured = lookup === null ? null : translateFrequency(lookup);
  const text = prose === null ? '' : plainTextFromHtml(prose).trim();
  if (!text) return answer(structured);
  const described = describedFrequency(text);
  if (described === null)
    return { updateFrequency: 'other', updateFrequencyYears: null, updateFrequencyText: text };
  const agrees =
    structured === null ||
    structured === described.updateFrequency ||
    (structured === 'annually' && described.updateFrequency === 'every-n-years');
  if (!agrees) throw new Error(`Conflicting source update frequencies: ${lookup}; ${prose}`);
  return described;
}
