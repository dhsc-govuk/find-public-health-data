import {
  canAssignReviewers,
  canRespondToReview,
  canSchedulePublication,
  canSubmitIndicator,
  canWithdrawSubmission,
  type IndicatorAccess,
  type SessionUser,
} from '@fphd/auth/permissions';
import type { schema } from '@fphd/db';
import type { IndicatorSubmissionStatus } from '@fphd/utils/indicator-submission-status';

import {
  type DraftStatus,
  type DraftSubmissionStatus,
  INDICATOR_STEPS,
  type IndicatorAdminSummary,
  type IndicatorStatus,
  type IndicatorStep,
  indicatorAccess,
} from './contract.ts';

type VersionStatus = schema.IndicatorVersionStatus;

/** What the workflow reads to decide which steps are open: the version and its latest submission. */
export interface IndicatorWorkflowContext {
  indicatorStatus: IndicatorStatus;
  versionStatus: VersionStatus;
  isLocked: boolean;
  /** Null until the version is first submitted. */
  latestSubmissionStatus: IndicatorSubmissionStatus | null;
}

/** Where a step leaves the version and the submission it writes. */
export interface IndicatorWorkflowState {
  versionStatus: VersionStatus;
  submissionStatus: IndicatorSubmissionStatus;
  isLocked: boolean;
}

interface StepEntry {
  from: {
    indicatorStatuses: readonly IndicatorStatus[];
    versionStatuses: readonly VersionStatus[];
    isLocked: boolean;
    submissionStatuses: readonly (IndicatorSubmissionStatus | null)[];
  };
  leadsTo: IndicatorWorkflowState;
  /** True for a step that starts a submission, which goes straight to any reviewers carried. */
  carriesReviewers?: true;
  /** Who may take the step, a check from `@fphd/auth/permissions`. */
  permission: (user: SessionUser, indicator: IndicatorAccess) => boolean;
}

// The permission for a step no user may take. Scheduled publication takes the publish step
// itself when the publication time comes, so no route offers that step to a user.
const noUser = () => false;

const RESPONSE_FROM: StepEntry['from'] = {
  indicatorStatuses: ['new'],
  versionStatuses: ['draft'],
  isLocked: true,
  submissionStatuses: ['in_review'],
};

const STEPS: Readonly<Record<IndicatorStep, StepEntry>> = {
  // A new indicator only, until the update journey can be submitted.
  submit: {
    from: {
      indicatorStatuses: ['new'],
      versionStatuses: ['draft'],
      isLocked: false,
      submissionStatuses: [null, 'withdrawn'],
    },
    leadsTo: { versionStatus: 'draft', submissionStatus: 'submitted', isLocked: true },
    carriesReviewers: true,
    permission: canSubmitIndicator,
  },
  // Open until a response, which ends an `in_review` submission while a round holds one response.
  withdraw: {
    from: {
      indicatorStatuses: ['new', 'live'],
      versionStatuses: ['draft'],
      isLocked: true,
      submissionStatuses: ['submitted', 'in_review'],
    },
    leadsTo: { versionStatus: 'draft', submissionStatus: 'withdrawn', isLocked: false },
    permission: canWithdrawSubmission,
  },
  // Assigns the first reviewers, or changes them. A new indicator only: an update needs triage.
  assign_reviewers: {
    from: {
      indicatorStatuses: ['new'],
      versionStatuses: ['draft'],
      isLocked: true,
      submissionStatuses: ['submitted', 'in_review'],
    },
    leadsTo: { versionStatus: 'draft', submissionStatus: 'in_review', isLocked: true },
    permission: canAssignReviewers,
  },
  // A reviewer's response ends the round: feedback and revisions unlock the draft for the
  // publisher, and an approval keeps it locked for publication.
  give_feedback: {
    from: RESPONSE_FROM,
    leadsTo: { versionStatus: 'draft', submissionStatus: 'changes_requested', isLocked: false },
    permission: canRespondToReview,
  },
  request_changes: {
    from: RESPONSE_FROM,
    leadsTo: { versionStatus: 'draft', submissionStatus: 'changes_requested', isLocked: false },
    permission: canRespondToReview,
  },
  approve: {
    from: RESPONSE_FROM,
    leadsTo: { versionStatus: 'draft', submissionStatus: 'approved', isLocked: true },
    permission: canRespondToReview,
  },
  resubmit: {
    from: {
      indicatorStatuses: ['new'],
      versionStatuses: ['draft'],
      isLocked: false,
      submissionStatuses: ['changes_requested'],
    },
    leadsTo: { versionStatus: 'draft', submissionStatus: 'submitted', isLocked: true },
    carriesReviewers: true,
    permission: canSubmitIndicator,
  },
  // An admin confirms an approved new indicator's publication date, which schedules it.
  schedule: {
    from: {
      indicatorStatuses: ['new'],
      versionStatuses: ['draft'],
      isLocked: true,
      submissionStatuses: ['approved'],
    },
    leadsTo: { versionStatus: 'scheduled', submissionStatus: 'approved', isLocked: true },
    permission: canSchedulePublication,
  },
  // Changes the publication date of a scheduled version, which stays scheduled with the new date.
  // The step stays open until the version is published.
  change_publication_date: {
    from: {
      indicatorStatuses: ['new'],
      versionStatuses: ['scheduled'],
      isLocked: true,
      submissionStatuses: ['approved'],
    },
    leadsTo: { versionStatus: 'scheduled', submissionStatus: 'approved', isLocked: true },
    permission: canSchedulePublication,
  },
  // Publishes the scheduled version of an indicator that has never been published, at its
  // publication time. The version stays locked once it is published.
  publish: {
    from: {
      indicatorStatuses: ['new'],
      versionStatuses: ['scheduled'],
      isLocked: true,
      submissionStatuses: ['approved'],
    },
    leadsTo: { versionStatus: 'published', submissionStatus: 'approved', isLocked: true },
    permission: noUser,
  },
};

/** What a step's write carries over from the submission before it. */
export interface IndicatorStepCarry {
  /** How many of the latest submission's reviewers may still review the indicator. */
  carriedReviewerCount: number;
}

export type IndicatorNextState =
  | { ok: true; state: IndicatorWorkflowState }
  | { ok: false; reason: 'not_allowed' };

function isOpen({ from }: StepEntry, context: IndicatorWorkflowContext): boolean {
  return (
    from.indicatorStatuses.includes(context.indicatorStatus) &&
    from.versionStatuses.includes(context.versionStatus) &&
    from.isLocked === context.isLocked &&
    from.submissionStatuses.includes(context.latestSubmissionStatus)
  );
}

/**
 * Where taking `step` now leads, or why it may not be taken. A submission that carries reviewers
 * over starts in review; whether a step is open never depends on them.
 */
export function nextState(
  context: IndicatorWorkflowContext,
  step: IndicatorStep,
  { carriedReviewerCount }: IndicatorStepCarry = { carriedReviewerCount: 0 },
): IndicatorNextState {
  const entry = STEPS[step];

  if (!isOpen(entry, context)) return { ok: false, reason: 'not_allowed' };

  return entry.carriesReviewers && carriedReviewerCount > 0
    ? { ok: true, state: { ...entry.leadsTo, submissionStatus: 'in_review' } }
    : { ok: true, state: entry.leadsTo };
}

/** Whether `step` starts a submission, which carries the latest submission's reviewers over. */
export function carriesReviewers(step: IndicatorStep): boolean {
  return STEPS[step].carriesReviewers === true;
}

/** The steps open now, whoever may take them. */
export function allowedSteps(context: IndicatorWorkflowContext): IndicatorStep[] {
  return INDICATOR_STEPS.filter((step) => isOpen(STEPS[step], context));
}

/** Whether the user may take `step` on the indicator, whether or not it is open now. */
export function mayTakeStep(
  user: SessionUser,
  indicator: IndicatorAccess,
  step: IndicatorStep,
): boolean {
  return STEPS[step].permission(user, indicator);
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
