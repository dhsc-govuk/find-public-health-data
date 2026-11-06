import {
  canAssignReviewers,
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
} from './contract.ts';

type StepPermission = (user: SessionUser, indicator: IndicatorAccess) => boolean;

// Scheduled publication takes the publish step when the date comes, so no route offers it.
const noUser = () => false;

/** Who may take each step, a check from `@fphd/auth/permissions`. */
const STEP_PERMISSIONS: Readonly<Record<IndicatorStep, StepPermission>> = {
  submit: canSubmitIndicator,
  withdraw: canWithdrawSubmission,
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
}

/** The steps open now that the user may take; none while there is no draft. */
export function stepsOpenTo(user: SessionUser, indicator: IndicatorWorkflowRow): IndicatorStep[] {
  if (indicator.draftStatus === null) return [];

  return allowedSteps({
    indicatorStatus: indicator.indicatorStatus,
    versionStatus: indicator.draftStatus,
    isLocked: indicator.draftLocked,
    latestSubmissionStatus: indicator.draftSubmissionStatus,
  }).filter((step) => mayTakeStep(user, indicatorAccess(indicator), step));
}
