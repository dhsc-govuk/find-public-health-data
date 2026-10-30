import type { IndicatorAccess } from '@fphd/auth/permissions';
import { z } from '@fphd/config/zod';
import { INDICATOR_SUBMISSION_STATUSES } from '@fphd/utils/indicator-submission-status';
import { SLUG_PATTERN, type SlugProblem, slugProblem } from '@fphd/utils/slug';

import { editVersionSchema } from './edit-version-contract.ts';
import { shortText } from './text-contract.ts';

/**
 * The wire contract for the internal API, shared by its routers and the internal web app's
 * loaders. Like the public contract it imports only zod and the slug rule, on its own subpath,
 * so the web app takes no Express or database dependency. Ids appear here and nowhere in the
 * public contract: a write needs a stable address, and the slug is editable.
 */
export const topicIdSchema = z.uuid();

export const topicAdminSummarySchema = z.object({
  id: topicIdSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const topicAdminSummaryListSchema = z.array(topicAdminSummarySchema);

export const topicAdminDetailSchema = topicAdminSummarySchema.extend({
  description: z.string(),
  /** A hash of the editable fields. A save sends it back to show it saw the latest values. */
  version: editVersionSchema,
});

/** A topic with the count that decides whether it can be deleted. */
export const topicAdminDetailWithLinkCountSchema = topicAdminDetailSchema.extend({
  linkedIndicatorCount: z.number().int().nonnegative(),
});

/**
 * The import rules (`topicRecordSchema`) plus the messages a form shows. Values are trimmed
 * before they are measured. Uniqueness is left to the database, which reports it as a field error.
 */
export const topicUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Enter a topic name'),
  slug: z
    .string()
    .trim()
    .min(1, 'Enter a slug')
    .regex(SLUG_PATTERN, 'Slug must be lowercase letters or numbers, separated by hyphens'),
  description: z.string().trim().min(1, 'Enter a description'),
});

export const topicFieldSchema = z.enum(['title', 'slug', 'description']);

export const topicFieldErrorsSchema = z.partialRecord(topicFieldSchema, z.string());

export const topicCreateResponseSchema = z.object({
  topic: topicAdminDetailSchema,
});

export const topicUpdateResponseSchema = z.object({
  /** False when the submission matched the stored topic, so nothing was written. */
  changed: z.boolean(),
  topic: topicAdminDetailSchema,
});

/**
 * The 400 and 409 errors. `validation_failed` and `slug_taken` name the fields at fault.
 * `changed` means someone edited the topic after the form was shown, and includes the topic's
 * current version.
 */
export const topicUpdateErrorSchema = z.discriminatedUnion('error', [
  z.object({ error: z.literal('invalid_id') }),
  z.object({ error: z.literal('invalid_version') }),
  z.object({ error: z.literal('changed'), version: editVersionSchema }),
  z.object({
    error: z.enum(['validation_failed', 'slug_taken']),
    fieldErrors: topicFieldErrorsSchema,
  }),
]);

/** The 409 a delete answers while indicators link to the topic. */
export const topicDeleteErrorSchema = z.object({ error: z.literal('in_use') });

export type TopicAdminSummary = z.infer<typeof topicAdminSummarySchema>;
export type TopicAdminDetail = z.infer<typeof topicAdminDetailSchema>;
export type TopicAdminDetailWithLinkCount = z.infer<typeof topicAdminDetailWithLinkCountSchema>;
export type TopicField = z.infer<typeof topicFieldSchema>;
export type TopicFieldErrors = z.infer<typeof topicFieldErrorsSchema>;
export type TopicUpdate = z.infer<typeof topicUpdateSchema>;
export type TopicCreateResponse = z.infer<typeof topicCreateResponseSchema>;
export type TopicUpdateResponse = z.infer<typeof topicUpdateResponseSchema>;
export type TopicUpdateError = z.infer<typeof topicUpdateErrorSchema>;
export type TopicDeleteError = z.infer<typeof topicDeleteErrorSchema>;

/** What the public has: live once any version is published, new until then. */
export const indicatorStatusSchema = z.enum(['new', 'live']);

/** The open draft's workflow state. */
export const draftStatusSchema = z.enum(['draft']);

/** Where the draft's latest submission for review stands. */
export const draftSubmissionStatusSchema = z.enum(INDICATOR_SUBMISSION_STATUSES);

/** The steps a version takes through review, in the order the workflow allows them. */
export const INDICATOR_STEPS = ['submit', 'withdraw', 'assign_reviewers'] as const;

export const indicatorStepSchema = z.enum(INDICATOR_STEPS);

/** A reviewer assigned to the draft's latest submission. */
export const draftReviewerSchema = z.object({ id: z.uuid(), name: z.string().min(1) });

/**
 * Both statuses are derived from the versions, never stored, and sent as values rather than
 * labels: what each is called is the web UI's decision.
 */
export const indicatorAdminSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  /** The team whose publishers own it. */
  teamId: z.uuid().nullable(),
  updatedAt: z.iso.datetime(),
  indicatorStatus: indicatorStatusSchema,
  /** Null while the indicator has no draft, which for a live one means it is published as is. */
  draftStatus: draftStatusSchema.nullable(),
  /** True while the draft is under review, so no publisher may edit it; false with no draft. */
  draftLocked: z.boolean(),
  /** Null until the draft is first submitted, and while there is no draft. */
  draftSubmissionStatus: draftSubmissionStatusSchema.nullable(),
  /** The reviewers of the draft's latest submission, by name; empty until they are assigned. */
  draftReviewers: z.array(draftReviewerSchema),
});

/** What the permission checks need to know about an indicator, from its row or its detail. */
export function indicatorAccess({
  teamId,
  draftReviewers,
}: Pick<IndicatorAdminSummary, 'teamId' | 'draftReviewers'>): IndicatorAccess {
  return { teamId, reviewerIds: draftReviewers.map(({ id }) => id) };
}

/** Parsed from a query string, so the page arrives as text; absent means the first page. */
export const indicatorPageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

/** The API list's filter: `teams=own` keeps to the teams the user publishes for. */
export const indicatorListTeamsQuerySchema = z.object({ teams: z.literal('own').optional() });

/** A dashboard row, which names the team and the people for the publisher to read. */
export const indicatorAdminListItemSchema = indicatorAdminSummarySchema.extend({
  /** Null while the indicator is in no team. */
  teamName: z.string().nullable(),
  /** The display name of whoever wrote the indicator's first version. */
  createdBy: z.string().nullable(),
  /** The display name of whoever made the edit `updatedAt` dates. */
  lastEditedBy: z.string().nullable(),
});

export const indicatorAdminPageSchema = z.object({
  indicators: z.array(indicatorAdminListItemSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});

/** The open submissions an IMRG manager works through, oldest submission first. */
export const indicatorsUnderReviewSchema = z.object({
  /** Waiting for reviewers: the latest submission is `submitted`. */
  unassigned: z.array(indicatorAdminListItemSchema),
  /** Reviewers assigned: the latest submission is `in_review`. */
  assigned: z.array(indicatorAdminListItemSchema),
});

/** The submissions in review that a reviewer is assigned, oldest submission first. */
export const indicatorsToReviewSchema = z.object({
  indicators: z.array(indicatorAdminListItemSchema),
});

export const indicatorIdSchema = z.uuid();

/** The workflow steps the user may take on the indicator now, so the web offers only those. */
export const indicatorActionsSchema = z.array(indicatorStepSchema);

export const indicatorAdminDetailSchema = indicatorAdminSummarySchema.extend({
  /** The public indicator number, which is what a publisher knows an indicator by. */
  shortId: z.number().int(),
  /** The published version's slug: the indicator's public address, absent until it has one. */
  publishedSlug: z.string().min(1).nullable(),
  /** The draft's latest submission, which a withdrawal names; null until the first. */
  draftSubmissionNumber: z.number().int().positive().nullable(),
  /** When the draft asks to be published; null with no draft or no answer yet. */
  draftScheduledPublishAt: z.iso.datetime().nullable(),
  /** A hash of the name. A rename sends it back to show it saw the latest name. */
  nameVersion: editVersionSchema,
  actions: indicatorActionsSchema,
});

/** Why the slug rule refuses a name, in the words the publisher reads. */
const SLUG_PROBLEM_MESSAGES: Record<SlugProblem, string> = {
  digits: 'Enter a name that is not only numbers',
  empty: 'Enter a name that includes letters or numbers',
  reserved: 'Enter a different name, this one is reserved for the service',
};

/**
 * The one answer the name page asks for, whether it starts an indicator or renames a draft.
 * The name carries the indicator's public address, so it is held to the slug rule here
 * rather than at the write, where a name that yields no slug is a bug.
 */
export const indicatorNameSchema = z.object({
  name: shortText('Indicator name')
    .min(1, 'Enter the name of the indicator')
    .superRefine((name, ctx) => {
      const problem = slugProblem(name);

      if (problem !== undefined) {
        ctx.addIssue({ code: 'custom', message: SLUG_PROBLEM_MESSAGES[problem] });
      }
    }),
});

/** The team a new indicator joins, which its creator chooses from their own before naming it. */
export const indicatorTeamSchema = z.object({ teamId: z.uuid() });

export const indicatorFieldSchema = z.enum(['name']);

export const indicatorFieldErrorsSchema = z.partialRecord(indicatorFieldSchema, z.string());

/** A created or renamed indicator reads the same as one fetched by id. */
export const indicatorCreateResponseSchema = indicatorAdminDetailSchema;

/**
 * The 400 and 409 answers. A missing or malformed team names no field: the name page never asks
 * for one.
 */
export const indicatorCreateErrorSchema = z.discriminatedUnion('error', [
  z.object({ error: z.literal('invalid_team') }),
  z.object({
    error: z.enum(['validation_failed', 'slug_taken']),
    fieldErrors: indicatorFieldErrorsSchema,
  }),
]);

/**
 * The 400 and 409 errors. `validation_failed` and `slug_taken` name the fields at fault.
 * `locked` means the draft is locked for review. `changed` means someone renamed the draft
 * after the page was shown, and includes the name's current version. A missing indicator or
 * draft is a 404, which the client throws.
 */
export const indicatorUpdateErrorSchema = z.discriminatedUnion('error', [
  z.object({ error: z.literal('invalid_id') }),
  z.object({ error: z.literal('invalid_version') }),
  z.object({ error: z.literal('locked') }),
  z.object({ error: z.literal('changed'), version: editVersionSchema }),
  z.object({
    error: z.enum(['validation_failed', 'slug_taken']),
    fieldErrors: indicatorFieldErrorsSchema,
  }),
]);

export type IndicatorAdminSummary = z.infer<typeof indicatorAdminSummarySchema>;
export type IndicatorAdminListItem = z.infer<typeof indicatorAdminListItemSchema>;
export type IndicatorAdminPage = z.infer<typeof indicatorAdminPageSchema>;
export type IndicatorsUnderReview = z.infer<typeof indicatorsUnderReviewSchema>;
export type IndicatorsToReview = z.infer<typeof indicatorsToReviewSchema>;
export type IndicatorStatus = z.infer<typeof indicatorStatusSchema>;
export type DraftStatus = z.infer<typeof draftStatusSchema>;
export type DraftSubmissionStatus = z.infer<typeof draftSubmissionStatusSchema>;
export type DraftReviewer = z.infer<typeof draftReviewerSchema>;
export type IndicatorStep = z.infer<typeof indicatorStepSchema>;
export type IndicatorAdminDetail = z.infer<typeof indicatorAdminDetailSchema>;
export type IndicatorName = z.infer<typeof indicatorNameSchema>;
export type IndicatorTeam = z.infer<typeof indicatorTeamSchema>;
export type IndicatorField = z.infer<typeof indicatorFieldSchema>;
export type IndicatorFieldErrors = z.infer<typeof indicatorFieldErrorsSchema>;
export type IndicatorCreateResponse = z.infer<typeof indicatorCreateResponseSchema>;
export type IndicatorCreateError = z.infer<typeof indicatorCreateErrorSchema>;
export type IndicatorUpdateError = z.infer<typeof indicatorUpdateErrorSchema>;

/** Where one task on an indicator's task list stands; only the data table is ever in progress. */
export const indicatorTaskStatusSchema = z.enum(['not_started', 'in_progress', 'completed']);

/** The tasks the API judges: the name, the data table and each section. */
export const indicatorTaskKeySchema = z.enum([
  'name',
  'data-table',
  'definition-and-rationale',
  'polarity',
  'data-quality',
  'numerator',
  'denominator',
  'calculation',
  'confidence-intervals',
  'update-frequency',
  'value-type-and-units',
  'period-type',
  'other-notes-and-caveats',
  'publishing-date',
  'links',
  'variance-and-quality',
  'justifications',
  'other-comments',
  'copyright-and-data-reuse',
  'benchmarking',
  'sex-and-ages',
  'tagging',
]);

export const indicatorTaskStatusesSchema = z.record(
  indicatorTaskKeySchema,
  indicatorTaskStatusSchema,
);

/**
 * Everything the task list page shows about a draft in one answer: what the indicator is
 * called and its statuses, as the detail response gives them, whether this edit changes a
 * published indicator, and where each task stands.
 */
export const indicatorTaskListSchema = z.object({
  indicator: indicatorAdminDetailSchema.pick({
    id: true,
    shortId: true,
    name: true,
    indicatorStatus: true,
    // Nullable as picked, but never null here: the endpoint answers 404 when there is no draft.
    draftStatus: true,
    draftSubmissionStatus: true,
  }),
  /** True when the indicator is live, so this edit revises what the public has. */
  isUpdate: z.boolean(),
  /** True once every task is complete. */
  canSubmit: z.boolean(),
  tasks: indicatorTaskStatusesSchema,
  /** The draft's last edit, which a submission sends back to confirm the draft it was shown. */
  draftUpdatedAt: z.iso.datetime(),
  /** False while the draft is locked for review, so none of its tasks may be edited. */
  editable: z.boolean(),
  actions: indicatorActionsSchema,
});

/** `no_draft` is the PATCH route's word for an indicator with nothing to edit. */
export const indicatorTaskListErrorSchema = z.object({
  error: z.enum(['invalid_id', 'not_found', 'no_draft']),
});

/** A submission confirms the draft as the task list showed it, by its last edit. */
export const indicatorSubmitSchema = z.object({ draftUpdatedAt: z.iso.datetime() });

/** The 400 and 409 answers. A missing indicator or draft is a 404, which the client throws. */
export const indicatorSubmitErrorSchema = z.object({
  error: z.enum(['invalid_id', 'invalid_draft_updated_at', 'not_allowed', 'changed', 'incomplete']),
});

/** A withdrawal names the submission the publisher was shown, so it never ends a newer one. */
export const indicatorWithdrawSchema = z.object({
  submissionNumber: z.number().int().positive(),
});

/** The 400 and 409 answers, as the submission's. */
export const indicatorWithdrawErrorSchema = z.object({
  error: z.enum(['invalid_id', 'invalid_submission_number', 'not_allowed', 'changed']),
});

/**
 * An assignment names the submission and the reviewers the manager was shown, so it never
 * overwrites a change they have not seen. It replaces the reviewers with `reviewerIds`.
 */
export const indicatorAssignReviewersSchema = z.object({
  submissionNumber: z.number().int().positive(),
  previousReviewerIds: z.array(z.uuid()),
  reviewerIds: z.array(z.uuid()),
});

/** The 400 and 409 answers. A missing indicator or draft is a 404, which the client throws. */
export const indicatorAssignReviewersErrorSchema = z.object({
  error: z.enum([
    'invalid_id',
    'invalid_request',
    'no_reviewers',
    'duplicate_reviewers',
    'not_allowed',
    'changed',
    'not_a_reviewer',
  ]),
});

export type IndicatorAssignReviewers = z.infer<typeof indicatorAssignReviewersSchema>;
export type IndicatorAssignReviewersError = z.infer<typeof indicatorAssignReviewersErrorSchema>;

/** A reviewer the IMRG manager may assign, with how many indicators they are reviewing now. */
export const reviewerOptionSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  assignedIndicatorCount: z.number().int().min(0),
});

/** The reviewers who may review an indicator: neither its creator nor its submitter. */
export const reviewerOptionsSchema = z.object({ reviewers: z.array(reviewerOptionSchema) });

export type ReviewerOption = z.infer<typeof reviewerOptionSchema>;
export type ReviewerOptions = z.infer<typeof reviewerOptionsSchema>;

export type IndicatorTaskStatus = z.infer<typeof indicatorTaskStatusSchema>;
export type IndicatorTaskKey = z.infer<typeof indicatorTaskKeySchema>;
export type IndicatorTaskStatuses = z.infer<typeof indicatorTaskStatusesSchema>;
export type IndicatorTaskList = z.infer<typeof indicatorTaskListSchema>;
export type IndicatorTaskListError = z.infer<typeof indicatorTaskListErrorSchema>;
export type IndicatorSubmit = z.infer<typeof indicatorSubmitSchema>;
export type IndicatorSubmitError = z.infer<typeof indicatorSubmitErrorSchema>;
export type IndicatorWithdraw = z.infer<typeof indicatorWithdrawSchema>;
export type IndicatorWithdrawError = z.infer<typeof indicatorWithdrawErrorSchema>;

export * from './data-table-check-contract.ts';
export * from './data-upload-contract.ts';
export * from './edit-version-contract.ts';
export * from './indicator-benchmarking-contract.ts';
export * from './indicator-calculation-contract.ts';
export * from './indicator-confidence-intervals-contract.ts';
export * from './indicator-copyright-and-data-reuse-contract.ts';
export * from './indicator-data-quality-contract.ts';
export * from './indicator-definition-and-rationale-contract.ts';
export * from './indicator-justifications-contract.ts';
export * from './indicator-links-contract.ts';
export * from './indicator-numerator-denominator-contract.ts';
export * from './indicator-other-comments-contract.ts';
export * from './indicator-other-notes-and-caveats-contract.ts';
export * from './indicator-period-type-contract.ts';
export * from './indicator-polarity-contract.ts';
export * from './indicator-publishing-date-contract.ts';
export * from './indicator-section-contract.ts';
export * from './indicator-sex-and-ages-contract.ts';
export * from './indicator-tagging-contract.ts';
export * from './indicator-update-frequency-contract.ts';
export * from './indicator-value-type-and-units-contract.ts';
export * from './indicator-variance-and-quality-contract.ts';
export * from './notes-for-reviewers-contract.ts';
