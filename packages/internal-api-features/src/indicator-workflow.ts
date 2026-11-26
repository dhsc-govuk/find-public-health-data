import {
  canAssignReviewers,
  canDecideUpdates,
  canDiscardDraft,
  canRespondToReview,
  canSchedulePublication,
  canSubmitIndicator,
  canWithdrawSubmission,
  type IndicatorAccess,
  type SessionUser,
} from '@fphd/auth/permissions';
import { allowedSteps } from '@fphd/internal-workflow';

import {
  type DraftStatus,
  type DraftSubmissionStatus,
  type IndicatorAdminSummary,
  type IndicatorStatus,
  type IndicatorStep,
  indicatorAccess,
  type UpdateDecision,
} from './contract.ts';

type StepPermission = (user: SessionUser, indicator: IndicatorAccess) => boolean;

// The permission for a step no user may take. Scheduled publication takes the publish step
// itself when the publication time comes, so no route offers that step to a user.
const noUser = () => false;

/** For each step, the check from `@fphd/auth/permissions` that decides which users may take it. */
const STEP_PERMISSIONS: Readonly<Record<IndicatorStep, StepPermission>> = {
  submit: canSubmitIndicator,
  withdraw: canWithdrawSubmission,
  send_update_to_imrg: canDecideUpdates,
  request_update_revisions: canDecideUpdates,
  approve_update: canDecideUpdates,
  assign_reviewers: canAssignReviewers,
  give_feedback: canRespondToReview,
  request_changes: canRespondToReview,
  approve: canRespondToReview,
  resubmit: canSubmitIndicator,
  schedule: canSchedulePublication,
  change_publication_date: canSchedulePublication,
  publish: noUser,
};

/** Whether the user may take `step` on the indicator, whether or not it is open now. */
export function mayTakeStep(
  user: SessionUser,
  indicator: IndicatorAccess,
  step: IndicatorStep,
): boolean {
  return STEP_PERMISSIONS[step](user, indicator);
}

/**
 * An indicator as the list and detail rows describe it, which is enough to place its draft and
 * to know who may act on it.
 */
export interface IndicatorWorkflowRow
  extends Pick<IndicatorAdminSummary, 'teamId' | 'draftReviewers'> {
  indicatorStatus: IndicatorStatus;
  draftStatus: DraftStatus | null;
  draftLocked: boolean;
  draftSubmissionStatus: DraftSubmissionStatus | null;
  draftUpdateDecision: UpdateDecision | null;
}

/** The steps open now that the user may take; none while there is no draft. */
export function stepsOpenTo(user: SessionUser, indicator: IndicatorWorkflowRow): IndicatorStep[] {
  if (indicator.draftStatus === null) return [];

  return allowedSteps({
    indicatorStatus: indicator.indicatorStatus,
    versionStatus: indicator.draftStatus,
    isLocked: indicator.draftLocked,
    latestSubmissionStatus: indicator.draftSubmissionStatus,
    latestUpdateDecision: indicator.draftUpdateDecision,
  }).filter((step) => mayTakeStep(user, indicatorAccess(indicator), step));
}

/** What decides whether a draft can be discarded. */
export interface DiscardState {
  /** The draft version's status, or null when there is no draft. */
  draftStatus: DraftStatus | null;
  /** Whether every submission of it was withdrawn, as none is while it has none. */
  draftSubmissionsWithdrawn: boolean;
}

/**
 * Whether the draft can be discarded, whoever asks. It can until a review starts. A submitted draft
 * must be withdrawn first, and one ever sent back for changes or approved can never be discarded.
 */
export function isDraftDiscardable({
  draftStatus,
  draftSubmissionsWithdrawn,
}: DiscardState): boolean {
  return draftStatus === 'draft' && draftSubmissionsWithdrawn;
}

/** Whether the user may discard the indicator's draft now. */
export function mayDiscardDraft(
  user: SessionUser,
  indicator: DiscardState & Pick<IndicatorAdminSummary, 'teamId' | 'draftReviewers'>,
): boolean {
  return isDraftDiscardable(indicator) && canDiscardDraft(user, indicatorAccess(indicator));
}
