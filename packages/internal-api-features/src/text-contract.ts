import { z } from '@fphd/config/zod';
import {
  CONTROL_CHARACTER,
  CONTROL_CHARACTER_BUT_NEWLINE_OR_TAB,
} from '@fphd/utils/control-character';

/** The most characters a single-line text input takes. */
export const SHORT_TEXT_MAX_LENGTH = 300;

/** The most characters a textarea takes. */
export const LONG_TEXT_MAX_LENGTH = 10_000;

/** Counted in code points, as Postgres's `length()` counts, so an emoji is one character. */
function characterCount(text: string): number {
  return [...text].length;
}

function limited(text: z.ZodString, noun: string, max: number, refused: RegExp) {
  return text
    .refine(
      (value) => characterCount(value) <= max,
      `${noun} must be ${max.toLocaleString('en-GB')} characters or fewer`,
    )
    .refine(
      (value) => !refused.test(value),
      `${noun} must not include hidden formatting characters`,
    );
}

/**
 * Text from a single-line input, trimmed, refused with `noun` in its messages when it holds a
 * control character or is longer than `max`. Empty text passes: a field that requires an
 * answer adds its own `.min(1, …)`.
 */
export function shortText(noun: string, max = SHORT_TEXT_MAX_LENGTH) {
  return limited(z.string().trim(), noun, max, CONTROL_CHARACTER);
}

/**
 * Text from a textarea, as `shortText` but up to 10,000 characters, keeping newlines and tabs.
 * Line endings become LF, and only the ends are trimmed, so the text can be read as Markdown.
 */
export function longText(noun: string) {
  return limited(
    z
      .string()
      .overwrite((value) => value.replaceAll(/\r\n?/g, '\n'))
      .trim(),
    noun,
    LONG_TEXT_MAX_LENGTH,
    CONTROL_CHARACTER_BUT_NEWLINE_OR_TAB,
  );
}
