import type { BodyLimit } from '@fphd/api-server';

import { indicatorSectionPath } from './indicator-section.ts';
import { REVIEW_RESPONSE_PATH } from './indicator-submissions.ts';

/**
 * The internal routes that take a JSON body larger than the default 100 kB, for `createApiApp`.
 * A route that needs more than the default is added here, with the reason it does. Every other
 * route keeps 100 kB.
 */
export const INTERNAL_API_BODY_LIMITS: readonly BodyLimit[] = [
  // Up to 19 flags of 10,000 characters each beside a clarification request, in UTF-8.
  { path: REVIEW_RESPONSE_PATH, limit: '1mb' },
  // Six textareas of 10,000 characters, up to about 240 kB of JSON when every character is
  // an emoji, which takes 4 bytes.
  { path: indicatorSectionPath('justifications'), limit: '256kb' },
  // Twenty links of up to 2,300 characters each, address and text together, about 184 kB.
  { path: indicatorSectionPath('links'), limit: '256kb' },
];
