import { z } from '@fphd/config/zod';
import { FLAGGABLE_TASK_KEYS, type IndicatorTaskKey } from '@fphd/utils/indicator-task-key';
import { isOneOf } from '@fphd/utils/is-one-of';
import { isDayOfMonth } from '@fphd/utils/period-type';
import { IMRG_DECISION_KINDS, REVIEW_RESPONSE_KINDS } from '@fphd/utils/review-response-kind';
import { type UkDate, ukDaysUntil } from '@fphd/utils/uk-time';

import { longText } from './text-contract.ts';

export const reviewResponseKindSchema = z.enum(REVIEW_RESPONSE_KINDS);

/** The tasks a response may flag: every task but the notes for reviewers. */
export const flaggableTaskKeySchema = z.enum(FLAGGABLE_TASK_KEYS);

/** What each task is called, on the task list and wherever a task is named to the user. */
export const INDICATOR_TASK_TITLES: Readonly<Record<IndicatorTaskKey, string>> = {
  'data-table': 'Data table',
  'value-type-and-units': 'Value type and units',
  'sex-and-ages': 'Sex, gender and ethnicity',
  ages: 'Ages',
  'period-type': 'Period type',
  polarity: 'Polarity',
  'data-quality': 'Data quality',
  name: 'Name',
  'definition-and-rationale': 'Definition and rationale',
  numerator: 'Numerator',
  denominator: 'Denominator',
  calculation: 'How the indicator was calculated',
  'confidence-intervals': 'Confidence intervals',
  benchmarking: 'Benchmarking',
  'other-notes-and-caveats': 'Other notes and caveats',
  tagging: 'Tagging',
  'copyright-and-data-reuse': 'Copyright and data re-use',
  'update-frequency': 'Update frequency',
  'publishing-date': 'Publishing date',
  'variance-and-quality': 'Variance and quality',
  justifications: 'Justifications',
  'other-comments': 'Other comments',
};

const IMRG_DATE = 'Date reviewed by IMRG';
const ENTER_IMRG_DATE = 'Enter the date this indicator was reviewed by IMRG';
const REAL_IMRG_DATE = `${IMRG_DATE} must be a real date`;
const PAST_IMRG_DATE = `${IMRG_DATE} must be today or in the past`;
export const SELECT_REVISIONS = 'Select what needs to be revised or clarified';
const ENTER_CLARIFICATION = 'Enter what you are requesting clarification about';

const ukDateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/London',
});

/** The refusal of an IMRG date before the version's first submission, dated in the UK. */
export function reviewedBeforeSubmissionMessage(firstSubmittedAt: Date): string {
  return `${IMRG_DATE} must be on or after ${ukDateFormat.format(firstSubmittedAt)}`;
}

function isoDate({ year, month, day }: UkDate): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIsoDate(value: string): UkDate | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return isDayOfMonth(day, month, year) ? { year, month, day } : undefined;
}

/** "What response are you submitting?": feedback before the meeting, or its decision. */
export const reviewResponseTypeSchema = z.object({
  responseType: z.enum(['pre_imrg_feedback', 'imrg_decision'], {
    error: 'Select the response you are submitting',
  }),
});

const imrgDateParts = [
  ['imrgReviewedOnDay', 'day'],
  ['imrgReviewedOnMonth', 'month'],
  ['imrgReviewedOnYear', 'year'],
] as const;

export const imrgReviewDateFieldSchema = z.enum([
  'imrgReviewedOnDay',
  'imrgReviewedOnMonth',
  'imrgReviewedOnYear',
]);

export type ImrgReviewDateField = z.infer<typeof imrgReviewDateFieldSchema>;

const listWithAnd = new Intl.ListFormat('en-GB', { type: 'conjunction' });

/** The rules a review date answers to beside being real: no later than today, no earlier than this. */
export interface ImrgReviewDateRules {
  now: Date;
  /** When the version was first submitted, null while it never has been. */
  firstSubmittedAt: Date | null;
}

/** Why a real UK date may not be the IMRG review date, if it may not. */
function imrgDateProblem(date: UkDate, { now, firstSubmittedAt }: ImrgReviewDateRules) {
  if (ukDaysUntil(now, date) > 0) return PAST_IMRG_DATE;
  if (firstSubmittedAt !== null && ukDaysUntil(firstSubmittedAt, date) < 0) {
    return reviewedBeforeSubmissionMessage(firstSubmittedAt);
  }
  return undefined;
}

/**
 * "When was this indicator reviewed by IMRG?": a real date as day, month and year, today or
 * earlier and not before the version's first submission, given as `imrgReviewedOn`. A message
 * about the whole date is given on each part, so the page marks every part to correct.
 */
export function imrgReviewDateSchemaFor(rules: ImrgReviewDateRules) {
  return z
    .object({
      imrgReviewedOnDay: z.string().trim(),
      imrgReviewedOnMonth: z.string().trim(),
      imrgReviewedOnYear: z.string().trim(),
    })
    .transform((answers, ctx) => {
      const every = (message: string) => {
        for (const [field] of imrgDateParts)
          ctx.addIssue({ code: 'custom', path: [field], message });
        return z.NEVER;
      };
      const missing = imrgDateParts.filter(([field]) => answers[field] === '');

      if (missing.length === imrgDateParts.length) return every(ENTER_IMRG_DATE);

      if (missing.length > 0) {
        const parts = listWithAnd.format(missing.map(([, part]) => part));
        for (const [field] of missing) {
          ctx.addIssue({
            code: 'custom',
            path: [field],
            message: `${IMRG_DATE} must include a ${parts}`,
          });
        }
        return z.NEVER;
      }

      if (!/^\d{4}$/.test(answers.imrgReviewedOnYear)) {
        ctx.addIssue({
          code: 'custom',
          path: ['imrgReviewedOnYear'],
          message: 'Year must include 4 numbers',
        });
        return z.NEVER;
      }

      const date = {
        year: Number(answers.imrgReviewedOnYear),
        month: /^\d{1,2}$/.test(answers.imrgReviewedOnMonth)
          ? Number(answers.imrgReviewedOnMonth)
          : 0,
        day: /^\d{1,2}$/.test(answers.imrgReviewedOnDay) ? Number(answers.imrgReviewedOnDay) : 0,
      };

      if (!isDayOfMonth(date.day, date.month, date.year)) return every(REAL_IMRG_DATE);

      const problem = imrgDateProblem(date, rules);
      return problem === undefined ? { imrgReviewedOn: isoDate(date) } : every(problem);
    });
}

/** "Was this indicator approved for publishing?": yes, or no with the revisions it needs. */
export const reviewApprovalSchema = z
  .object({
    approved: z.enum(['yes', 'no'], {
      error: 'Select whether this indicator was approved for publishing',
    }),
    revisionsKind: z.enum(['minor_revisions', 'major_revisions']).optional(),
  })
  .transform(({ approved, revisionsKind }, ctx) => {
    if (approved === 'yes') return { kind: 'approved' as const };
    if (revisionsKind === undefined) {
      ctx.addIssue({ code: 'custom', path: ['revisionsKind'], message: 'Select a reason' });
      return z.NEVER;
    }
    return { kind: revisionsKind };
  });

const reviewFlagSchema = z.object({ task: flaggableTaskKeySchema, notes: z.string() });

/**
 * A response's shape as the pages send it. An approval carries no flag or clarification request,
 * pre-IMRG feedback carries no date, and no task is flagged twice. The pages never send otherwise,
 * so the API refuses one that does as malformed rather than naming a field.
 */
export const reviewResponseBodySchema = z
  .object({
    submissionNumber: z.number().int().positive(),
    kind: reviewResponseKindSchema,
    imrgReviewedOn: z.string().nullable(),
    clarificationRequest: z.string().nullable(),
    flags: z.array(reviewFlagSchema),
  })
  .refine(
    ({ kind, flags, clarificationRequest }) =>
      kind !== 'approved' || (flags.length === 0 && clarificationRequest === null),
    'An approval carries no flags and no clarification request',
  )
  .refine(
    ({ kind, imrgReviewedOn }) => kind !== 'pre_imrg_feedback' || imrgReviewedOn === null,
    'Pre-IMRG feedback carries no review date',
  )
  .refine(
    ({ flags }) => new Set(flags.map(({ task }) => task)).size === flags.length,
    'A task is flagged once',
  );

export const reviewResponseFieldSchema = z.union([
  z.enum(['imrgReviewedOn', 'clarificationRequest', 'flags']),
  z.templateLiteral(['flags.', flaggableTaskKeySchema]),
]);

export type ReviewResponseField = z.infer<typeof reviewResponseFieldSchema>;

function isDecision(kind: z.infer<typeof reviewResponseKindSchema>): boolean {
  return isOneOf(IMRG_DECISION_KINDS, kind);
}

/**
 * The response's field rules on top of its shape, with `now` for the date. An IMRG decision
 * needs a real date no later than today. Feedback and revisions need a flagged task or a
 * clarification request, and each flag needs notes. Text is trimmed; whether the date is before
 * the version's first submission is the repository's to say, under the draft's lock.
 */
export function reviewResponseSchemaFor(now: Date) {
  return reviewResponseBodySchema.transform((body, ctx) => {
    const issue = (path: ReviewResponseField, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    const advised = body.kind === 'pre_imrg_feedback';

    if (isDecision(body.kind)) {
      const date = body.imrgReviewedOn === null ? undefined : parseIsoDate(body.imrgReviewedOn);
      if (body.imrgReviewedOn === null) issue('imrgReviewedOn', ENTER_IMRG_DATE);
      else if (date === undefined) issue('imrgReviewedOn', REAL_IMRG_DATE);
      else if (ukDaysUntil(now, date) > 0) issue('imrgReviewedOn', PAST_IMRG_DATE);
    }

    if (body.kind !== 'approved' && body.flags.length === 0 && body.clarificationRequest === null) {
      issue('flags', SELECT_REVISIONS);
    }

    const clarification =
      body.clarificationRequest === null
        ? undefined
        : longText('Clarification request')
            .min(1, ENTER_CLARIFICATION)
            .safeParse(body.clarificationRequest);
    if (clarification?.success === false) {
      issue('clarificationRequest', clarification.error.issues[0]?.message ?? ENTER_CLARIFICATION);
    }

    const flags = body.flags.map(({ task, notes }) => {
      const title = INDICATOR_TASK_TITLES[task].toLowerCase();
      const parsed = longText(`Revisions for ${title}`)
        .min(1, `Enter the revisions ${advised ? 'advised' : 'needed'} for ${title}`)
        .safeParse(notes);
      if (!parsed.success) issue(`flags.${task}`, parsed.error.issues[0]?.message ?? '');
      return { task, notes: parsed.data ?? notes };
    });

    return {
      submissionNumber: body.submissionNumber,
      kind: body.kind,
      imrgReviewedOn: body.imrgReviewedOn,
      clarificationRequest: clarification?.data ?? null,
      flags,
    };
  });
}

export const reviewResponseFieldErrorsSchema = z.partialRecord(
  reviewResponseFieldSchema,
  z.string(),
);

/**
 * The 400 and 409 answers. `validation_failed` names the fields at fault. `not_allowed` means
 * the submission no longer waits for a response; `changed` that it is not the one the reviewer
 * was shown; `not_a_reviewer` that they are no longer assigned to it. A missing indicator or
 * draft is a 404, which the client throws.
 */
export const reviewResponseErrorSchema = z.discriminatedUnion('error', [
  z.object({
    error: z.enum([
      'invalid_id',
      'invalid_request',
      'not_allowed',
      'changed',
      'not_a_reviewer',
      'no_publication_date',
    ]),
  }),
  z.object({
    error: z.literal('validation_failed'),
    fieldErrors: reviewResponseFieldErrorsSchema,
  }),
]);

export type ReviewResponseKind = z.infer<typeof reviewResponseKindSchema>;
export type FlaggableTaskKey = z.infer<typeof flaggableTaskKeySchema>;
export type ReviewResponseType = z.infer<typeof reviewResponseTypeSchema>;
export type ReviewApproval = z.infer<typeof reviewApprovalSchema>;
export type ReviewResponseBody = z.input<typeof reviewResponseBodySchema>;
export type ReviewResponseFieldErrors = z.infer<typeof reviewResponseFieldErrorsSchema>;
export type ReviewResponseError = z.infer<typeof reviewResponseErrorSchema>;
