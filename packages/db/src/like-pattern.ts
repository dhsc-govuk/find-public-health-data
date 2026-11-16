/**
 * The text with its LIKE wildcards (`%` and `_`) and the backslash escaped, so a LIKE or ILIKE
 * pattern built from it matches what the user typed character for character. The backslash is
 * Postgres's default LIKE escape character.
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}
