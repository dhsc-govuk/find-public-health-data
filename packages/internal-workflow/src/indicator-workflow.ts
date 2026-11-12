import type { schema } from '@fphd/db';
import type { IndicatorStatus } from '@fphd/utils/indicator-status';
import { INDICATOR_STEPS, type IndicatorStep } from '@fphd/utils/indicator-step';
import type { IndicatorSubmissionStatus } from '@fphd/utils/indicator-submission-status';

type VersionStatus = schema.IndicatorVersionStatus;

/**
 * What the workflow reads to decide which steps are open: whether the indicator has been
 * published, and the state of its draft version and of that version's latest submission.
 */
export interface IndicatorWorkflowContext {
  indicatorStatus: IndicatorStatus;
  versionStatus: VersionStatus;
  isLocked: boolean;
  /** Null until the version is submitted for the first time. */
  latestSubmissionStatus: IndicatorSubmissionStatus | null;
}

/** The version's status and lock, and the status of its submission, after a step is taken. */
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
  /**
   * True for a step whose new submission takes over the latest submission's reviewers. If any are
   * carried onto it, the new submission goes straight to 'in_review' instead of 'submitted'.
   */
  carriesReviewers?: true;
}

const RESPONSE_FROM: StepEntry['from'] = {
  indicatorStatuses: ['new'],
  versionStatuses: ['draft'],
  isLocked: true,
  submissionStatuses: ['in_review'],
};

const STEPS: Readonly<Record<IndicatorStep, StepEntry>> = {
  // Submits a new indicator's draft, or an update to a live indicator. A submitted update waits
  // for the core team's decision on it before any reviewers are assigned.
  submit: {
    from: {
      indicatorStatuses: ['new', 'live'],
      versionStatuses: ['draft'],
      isLocked: false,
      submissionStatuses: [null, 'withdrawn'],
    },
    leadsTo: { versionStatus: 'draft', submissionStatus: 'submitted', isLocked: true },
  },
  // The publisher can withdraw a submission until reviewers are assigned to it. A resubmission that
  // carries its reviewers over starts in 'in_review', so it cannot be withdrawn.
  withdraw: {
    from: {
      indicatorStatuses: ['new', 'live'],
      versionStatuses: ['draft'],
      isLocked: true,
      submissionStatuses: ['submitted'],
    },
    leadsTo: { versionStatus: 'draft', submissionStatus: 'withdrawn', isLocked: false },
  },
  // Assigns the first reviewers to a submission, or changes them. Only for a new indicator for
  // now, because an update to a live indicator will need triage first.
  assign_reviewers: {
    from: {
      indicatorStatuses: ['new'],
      versionStatuses: ['draft'],
      isLocked: true,
      submissionStatuses: ['submitted', 'in_review'],
    },
    leadsTo: { versionStatus: 'draft', submissionStatus: 'in_review', isLocked: true },
  },
  // A reviewer's response ends the review round. Giving feedback and requesting changes both
  // unlock the draft so the publisher can edit it. Approving keeps it locked, ready to schedule.
  give_feedback: {
    from: RESPONSE_FROM,
    leadsTo: { versionStatus: 'draft', submissionStatus: 'changes_requested', isLocked: false },
  },
  request_changes: {
    from: RESPONSE_FROM,
    leadsTo: { versionStatus: 'draft', submissionStatus: 'changes_requested', isLocked: false },
  },
  approve: {
    from: RESPONSE_FROM,
    leadsTo: { versionStatus: 'draft', submissionStatus: 'approved', isLocked: true },
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
  },
  // An admin confirms the publication date of an approved new indicator, and the version
  // becomes scheduled.
  schedule: {
    from: {
      indicatorStatuses: ['new'],
      versionStatuses: ['draft'],
      isLocked: true,
      submissionStatuses: ['approved'],
    },
    leadsTo: { versionStatus: 'scheduled', submissionStatus: 'approved', isLocked: true },
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
  },
};

/** What a step carries over from the latest submission onto the new one it starts. */
export interface IndicatorStepCarry {
  /** How many of the latest submission's reviewers move onto the new submission. */
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
 * The state that taking `step` now would lead to, or 'not_allowed' if the step is not open.
 * A new submission that carries reviewers over starts in 'in_review' rather than 'submitted'.
 * The carried reviewers change only where the step leads, never whether it is open.
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

/**
 * Whether `step` starts a new submission that takes over the latest submission's reviewers who may
 * still review the indicator.
 */
export function carriesReviewers(step: IndicatorStep): boolean {
  return STEPS[step].carriesReviewers === true;
}

/** The steps open in this context, without checking which user may take them. */
export function allowedSteps(context: IndicatorWorkflowContext): IndicatorStep[] {
  return INDICATOR_STEPS.filter((step) => isOpen(STEPS[step], context));
}
