import {
  type ReviewResponseKind,
  reviewResponseKindSchema,
} from '@fphd/internal-api-features/contract';

/**
 * The answers a reviewer has given so far, carried page to page in the query string so the
 * journey keeps no state on the server. Free text never travels here: the revisions page asks
 * for it last and posts it from its own form.
 */
export interface ReviewJourney {
  /** The submission the reviewer was shown, so a response never lands on a newer one. */
  submissionNumber: number;
  kind?: ReviewResponseKind | undefined;
  /** The IMRG review date, `YYYY-MM-DD`. */
  imrgReviewedOn?: string | undefined;
}

/** A key's one value, or undefined when the query leaves it out or repeats it. */
function single(params: URLSearchParams, key: string): string | undefined {
  const values = params.getAll(key);
  return values.length === 1 ? values[0] : undefined;
}

/** The journey the address carries, or none when it carries no valid one. */
export function journeyFrom(url: URL): ReviewJourney | undefined {
  const params = url.searchParams;
  const submission = single(params, 'submission');
  const kind = single(params, 'kind');
  const reviewedOn = single(params, 'reviewedOn');
  const parsedKind = reviewResponseKindSchema.safeParse(kind);

  if (submission === undefined || !/^[1-9]\d*$/.test(submission)) return undefined;
  if (params.has('kind') && !parsedKind.success) return undefined;
  if (params.has('reviewedOn') && !/^\d{4}-\d{2}-\d{2}$/.test(reviewedOn ?? '')) return undefined;

  return {
    submissionNumber: Number(submission),
    kind: parsedKind.data,
    imrgReviewedOn: reviewedOn,
  };
}

/** The query string that carries the journey on. */
export function journeySearch({ submissionNumber, kind, imrgReviewedOn }: ReviewJourney): string {
  const params = new URLSearchParams({ submission: String(submissionNumber) });
  if (kind !== undefined) params.set('kind', kind);
  if (imrgReviewedOn !== undefined) params.set('reviewedOn', imrgReviewedOn);
  return `?${params}`;
}

/** Whether the journey has what the revisions page needs: a kind that asks for revisions, dated if decided. */
export function isRevisionsJourney(journey: ReviewJourney): journey is ReviewJourney & {
  kind: Exclude<ReviewResponseKind, 'approved'>;
} {
  const { kind, imrgReviewedOn } = journey;
  if (kind === undefined || kind === 'approved') return false;
  return (kind === 'pre_imrg_feedback') === (imrgReviewedOn === undefined);
}
