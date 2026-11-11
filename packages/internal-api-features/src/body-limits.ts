import type { BodyLimit } from '@fphd/api-server';

import { indicatorTaskKeySchema } from './contract.ts';
import { indicatorSectionPath } from './indicator-section.ts';
import { REVIEW_RESPONSE_PATH } from './indicator-submissions.ts';

/**
 * The tasks a section's PUT saves. The name is saved by the indicator's own PATCH, and the data
 * table by an upload.
 */
const SECTION_KEYS = indicatorTaskKeySchema.options.filter(
  (key) => key !== 'name' && key !== 'data-table',
);

/**
 * The largest valid section save is the justifications section's five textareas of 10,000
 * characters. The internal web app sends each character in at most 4 bytes of JSON: a character
 * outside the Basic Multilingual Plane, such as an emoji, is 4 bytes of UTF-8, and a Windows line
 * break, which the contract counts as one character, is sent as the escapes `\r\n`. That makes
 * 200,000 bytes. The links section's 20 links of up to 2,300 characters come to 184,000. The
 * limit leaves room for the field names, the version and the other answers.
 */
const SECTION_BODY_LIMIT = '256kb';

/** The internal routes whose JSON bodies may pass the default 100 kB, for `createApiApp`. */
export const INTERNAL_API_BODY_LIMITS: readonly BodyLimit[] = [
  // Up to 19 flags of 10,000 characters each beside a clarification request, in UTF-8.
  { path: REVIEW_RESPONSE_PATH, limit: '1mb' },
  ...SECTION_KEYS.map((key) => ({ path: indicatorSectionPath(key), limit: SECTION_BODY_LIMIT })),
];
