import {
  type FlaggableTaskKey,
  flaggableTaskKeySchema,
  type ReviewResponseBody,
} from '@fphd/internal-api-features/contract';

import type { ReviewJourney } from './query.ts';

export interface ResponseTypeValues {
  responseType: string;
}

export interface DateValues {
  imrgReviewedOnDay: string;
  imrgReviewedOnMonth: string;
  imrgReviewedOnYear: string;
}

/** The date input's group name, under which it posts each part as `imrgReviewedOn[day]`. */
export const REVIEW_DATE = 'imrgReviewedOn';

/** The date input's parts, by the contract field each answers. */
export const REVIEW_DATE_PARTS = {
  imrgReviewedOnDay: 'day',
  imrgReviewedOnMonth: 'month',
  imrgReviewedOnYear: 'year',
} as const satisfies Record<keyof DateValues, string>;

/** The date page's form, under the contract's field names. */
export function readReviewDate(formData: FormData): DateValues {
  const part = (name: string) => {
    const value = formData.get(`${REVIEW_DATE}[${name}]`);
    return typeof value === 'string' ? value : '';
  };
  return {
    imrgReviewedOnDay: part(REVIEW_DATE_PARTS.imrgReviewedOnDay),
    imrgReviewedOnMonth: part(REVIEW_DATE_PARTS.imrgReviewedOnMonth),
    imrgReviewedOnYear: part(REVIEW_DATE_PARTS.imrgReviewedOnYear),
  };
}

export interface ApprovalValues {
  approved: string;
  revisionsKind: string;
}

/** The revisions page as sent: what is ticked, and the text under each ticked box. */
export interface RevisionsValues {
  clarification: boolean;
  clarificationRequest: string;
  flags: FlaggableTaskKey[];
  notes: Partial<Record<FlaggableTaskKey, string>>;
}

/** The name a flagged task's notes are sent under, which is also the field its error names. */
export function flagNotesName(task: FlaggableTaskKey): `flags.${FlaggableTaskKey}` {
  return `flags.${task}`;
}

/** The response type an earlier answer implies, so a back link reopens the page as it was left. */
export function responseTypeFrom(journey: ReviewJourney | undefined): string {
  if (journey?.kind === 'pre_imrg_feedback') return 'pre_imrg_feedback';
  return journey?.imrgReviewedOn === undefined ? '' : 'imrg_decision';
}

export function dateValuesFrom({ imrgReviewedOn }: ReviewJourney): DateValues {
  const [year = '', month = '', day = ''] = imrgReviewedOn?.split('-') ?? [];
  return {
    imrgReviewedOnDay: day.replace(/^0/, ''),
    imrgReviewedOnMonth: month.replace(/^0/, ''),
    imrgReviewedOnYear: year,
  };
}

export function approvalValuesFrom({ kind }: ReviewJourney): ApprovalValues {
  if (kind === 'approved') return { approved: 'yes', revisionsKind: '' };
  if (kind === 'minor_revisions' || kind === 'major_revisions') {
    return { approved: 'no', revisionsKind: kind };
  }
  return { approved: '', revisionsKind: '' };
}

/**
 * The revisions page's form. The page offers only the flaggable tasks, so a box it never showed
 * was not sent by it, and the request is refused whole.
 */
export function readRevisions(formData: FormData): RevisionsValues {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };
  const ticked = formData.getAll('flags').map((task) => flaggableTaskKeySchema.safeParse(task));

  if (ticked.some((task) => !task.success)) throw new Response('Bad Request', { status: 400 });

  const flags = ticked.flatMap(({ data }) => (data === undefined ? [] : [data]));

  return {
    clarification: formData.get('clarification') === 'yes',
    clarificationRequest: text('clarificationRequest'),
    flags,
    notes: Object.fromEntries(flags.map((task) => [task, text(flagNotesName(task))])),
  };
}

/** The response the revisions page sends: what is ticked, each with its text. */
export function revisionsBody(journey: ReviewJourney, values: RevisionsValues): ReviewResponseBody {
  return {
    submissionNumber: journey.submissionNumber,
    kind: journey.kind ?? 'pre_imrg_feedback',
    imrgReviewedOn: journey.imrgReviewedOn ?? null,
    clarificationRequest: values.clarification ? values.clarificationRequest : null,
    flags: values.flags.map((task) => ({ task, notes: values.notes[task] ?? '' })),
  };
}
