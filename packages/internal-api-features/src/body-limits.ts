import type { BodyLimit } from '@fphd/api-server';

import { REVIEW_RESPONSE_PATH } from './indicator-submissions.ts';

/** The internal routes whose JSON bodies may pass the default 100 kB, for `createApiApp`. */
export const INTERNAL_API_BODY_LIMITS: readonly BodyLimit[] = [
  // Up to 19 flags of 10,000 characters each beside a clarification request, in UTF-8.
  { path: REVIEW_RESPONSE_PATH, limit: '1mb' },
];
