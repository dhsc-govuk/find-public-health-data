import type { schema } from '@fphd/db';
import type { IndicatorStatus } from '@fphd/utils/indicator-status';
import { INDICATOR_STEPS, type IndicatorStep } from '@fphd/utils/indicator-step';
import type { IndicatorSubmissionStatus } from '@fphd/utils/indicator-submission-status';

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
}

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
  },
  // A reviewer's response ends the round: feedback and revisions unlock the draft for the
  // publisher, and an approval keeps it locked for publication.
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
  // An admin confirms an approved new indicator's publication date, which schedules it.
  schedule: {
    from: {
      indicatorStatuses: ['new'],
      versionStatuses: ['draft'],
      isLocked: true,
      submissionStatuses: ['approved'],
    },
    leadsTo: { versionStatus: 'scheduled', submissionStatus: 'approved', isLocked: true },
  },
  // Open from a scheduled version until it is published: it stays scheduled, with a new date.
  change_publication_date: {
    from: {
      indicatorStatuses: ['new'],
      versionStatuses: ['scheduled'],
      isLocked: true,
      submissionStatuses: ['approved'],
    },
    leadsTo: { versionStatus: 'scheduled', submissionStatus: 'approved', isLocked: true },
  },
  // A scheduled new indicator goes live at its publication time, and stays locked.
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
