import { TEAM_IDS } from '@fphd/auth';
import {
  type IndicatorAdminDetail,
  type IndicatorTaskStatus,
  type IndicatorTaskStatuses,
  indicatorTaskKeySchema,
} from '@fphd/internal-api-features/contract';

import type { SectionPageProps } from './indicator-section-form.tsx';

/** A well-formed version, as the API would return one. */
export const SHOWN_VERSION = 'a'.repeat(64);

/**
 * An indicator as the API's detail endpoint answers for it: a new draft in Team A, never
 * submitted, unless `overrides` say otherwise.
 */
export function indicatorDetail(
  overrides: Partial<IndicatorAdminDetail> = {},
): IndicatorAdminDetail {
  return {
    id: '00000000-0000-7000-8000-000000000001',
    shortId: 90366,
    name: 'Life expectancy at birth',
    teamId: TEAM_IDS.teamA,
    publishedSlug: null,
    updatedAt: '2026-01-02T00:00:00.000Z',
    indicatorStatus: 'new',
    draftStatus: 'draft',
    draftLocked: false,
    draftSubmissionStatus: null,
    draftResponseKind: null,
    draftReviewers: [],
    draftSubmissionNumber: null,
    draftScheduledPublishAt: null,
    draftFirstSubmittedAt: null,
    draftResponse: null,
    nameVersion: SHOWN_VERSION,
    actions: [],
    ...overrides,
  };
}

/** A section page's props when the last submission was not refused, for page tests. */
export const noRefusal: Omit<SectionPageProps<never, unknown>, 'values'> = {
  fieldErrors: {},
  formError: undefined,
  version: SHOWN_VERSION,
};

/** Every task at the one status, for a task list to start from. */
export function taskStatuses(status: IndicatorTaskStatus): IndicatorTaskStatuses {
  return Object.fromEntries(
    indicatorTaskKeySchema.options.map((key) => [key, status]),
  ) as IndicatorTaskStatuses;
}
