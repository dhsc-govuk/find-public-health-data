import { TEAM_IDS } from '@fphd/auth';
import {
  type IndicatorAdminDetail,
  type IndicatorTaskList,
  type IndicatorTaskStatus,
  type IndicatorTaskStatuses,
  indicatorTaskKeySchema,
} from '@fphd/internal-api-features/contract';
import type { FakeApiAnswer, FakeApiCall } from '@fphd/web-server/testing';

import type { SectionPageProps } from './indicator-section-form.tsx';

/** A well-formed version, as the API would return one. */
export const SHOWN_VERSION = 'a'.repeat(64);

/** The version the API gives a section once it has saved it. */
export const SAVED_VERSION = 'b'.repeat(64);

/** Answers a section save as the API does: with the answers it saved, at their new version. */
export function savedSection({ body }: FakeApiCall): FakeApiAnswer {
  const { answers } = body as { answers: object };
  return { answers, version: SAVED_VERSION };
}

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

/**
 * A draft's task list as the API answers it: the draft `indicatorDetail` describes, with every
 * task complete and ready to submit, unless `overrides` say otherwise.
 */
export function indicatorTaskList(overrides: Partial<IndicatorTaskList> = {}): IndicatorTaskList {
  const {
    id,
    shortId,
    name,
    indicatorStatus,
    draftStatus,
    draftSubmissionStatus,
    draftResponseKind,
  } = indicatorDetail();

  return {
    indicator: {
      id,
      shortId,
      name,
      indicatorStatus,
      draftStatus,
      draftSubmissionStatus,
      draftResponseKind,
    },
    isUpdate: false,
    canSubmit: true,
    tasks: taskStatuses('completed'),
    review: null,
    draftUpdatedAt: '2026-10-22T09:30:00.123Z',
    editable: true,
    actions: ['submit'],
    ...overrides,
  };
}
