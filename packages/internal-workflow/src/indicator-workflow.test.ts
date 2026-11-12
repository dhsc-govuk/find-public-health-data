import { schema } from '@fphd/db';
import { INDICATOR_STATUSES } from '@fphd/utils/indicator-status';
import { INDICATOR_STEPS } from '@fphd/utils/indicator-step';
import { INDICATOR_SUBMISSION_STATUSES } from '@fphd/utils/indicator-submission-status';
import { UPDATE_DECISIONS } from '@fphd/utils/update-decision';
import { describe, expect, it } from 'vitest';

import {
  allowedSteps,
  carriesReviewers,
  type IndicatorWorkflowContext,
  nextState,
} from './indicator-workflow.ts';

/**
 * Every context the workflow can be asked about: each combination of indicator status, version
 * status, lock, latest submission status, including no submission at all, and update decision,
 * including none.
 */
const ALL_CONTEXTS: IndicatorWorkflowContext[] = INDICATOR_STATUSES.flatMap((indicatorStatus) =>
  schema.INDICATOR_VERSION_STATUSES.flatMap((versionStatus) =>
    [false, true].flatMap((isLocked) =>
      [null, ...INDICATOR_SUBMISSION_STATUSES].flatMap((latestSubmissionStatus) =>
        [null, ...UPDATE_DECISIONS].map((latestUpdateDecision) => ({
          indicatorStatus,
          versionStatus,
          isLocked,
          latestSubmissionStatus,
          latestUpdateDecision,
        })),
      ),
    ),
  ),
);

/** The contexts with no update decision, which every step but the decisions reads the same way. */
const CONTEXTS = ALL_CONTEXTS.filter(({ latestUpdateDecision }) => latestUpdateDecision === null);

const UPDATE_DECISION_STEPS = [
  'send_update_to_imrg',
  'request_update_revisions',
  'approve_update',
] as const;

const unsubmitted: IndicatorWorkflowContext = {
  indicatorStatus: 'new',
  versionStatus: 'draft',
  isLocked: false,
  latestSubmissionStatus: null,
  latestUpdateDecision: null,
};
const withdrawn = { ...unsubmitted, latestSubmissionStatus: 'withdrawn' } as const;
const submitted = { ...unsubmitted, isLocked: true, latestSubmissionStatus: 'submitted' } as const;
const inReview = { ...submitted, latestSubmissionStatus: 'in_review' } as const;
const changesRequested = { ...unsubmitted, latestSubmissionStatus: 'changes_requested' } as const;
const approved = { ...submitted, latestSubmissionStatus: 'approved' } as const;
const scheduled = { ...approved, versionStatus: 'scheduled' } as const;

it.each(INDICATOR_STEPS)('opens %s in some context', (step) => {
  expect(CONTEXTS.some((context) => nextState(context, step).ok)).toBe(true);
});

it.each(INDICATOR_STEPS)('opens %s to a new indicator whatever the update decision', (step) => {
  for (const context of CONTEXTS.filter(({ indicatorStatus }) => indicatorStatus === 'new')) {
    for (const latestUpdateDecision of UPDATE_DECISIONS) {
      expect(nextState({ ...context, latestUpdateDecision }, step).ok).toBe(
        nextState(context, step).ok,
      );
    }
  }
});

/** The steps whose openness on an update depends on the core team's decision. */
const DECIDED_STEPS = [
  ...UPDATE_DECISION_STEPS,
  'assign_reviewers',
  'give_feedback',
  'request_changes',
  'approve',
] as const;

it.each(INDICATOR_STEPS.filter((step) => !(DECIDED_STEPS as readonly string[]).includes(step)))(
  'opens %s to an update whatever the update decision',
  (step) => {
    for (const context of CONTEXTS.filter(({ indicatorStatus }) => indicatorStatus === 'live')) {
      for (const latestUpdateDecision of UPDATE_DECISIONS) {
        expect(nextState({ ...context, latestUpdateDecision }, step).ok).toBe(
          nextState(context, step).ok,
        );
      }
    }
  },
);

describe('submit', () => {
  it.each([
    ['a new indicator', 'never submitted', unsubmitted],
    ['a new indicator', 'withdrawn', withdrawn],
    ['a live indicator', 'never submitted', { ...unsubmitted, indicatorStatus: 'live' }],
    ['a live indicator', 'withdrawn', { ...withdrawn, indicatorStatus: 'live' }],
  ] as const)("locks %s's %s draft under a submitted submission", (_, _state, context) => {
    expect(nextState(context, 'submit')).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'submitted', isLocked: true },
    });
  });

  it('never carries reviewers onto the submission', () => {
    expect(nextState(withdrawn, 'submit', { carriedReviewerCount: 2 })).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'submitted', isLocked: true },
    });
  });

  it('is refused in every other context', () => {
    const open = CONTEXTS.filter((context) => nextState(context, 'submit').ok);

    expect(open).toEqual([
      unsubmitted,
      withdrawn,
      { ...unsubmitted, indicatorStatus: 'live' },
      { ...withdrawn, indicatorStatus: 'live' },
    ]);
  });
});

describe('withdraw', () => {
  it.each([
    ['submitted', 'new', submitted],
    ['submitted', 'live', submitted],
  ] as const)(
    'unlocks the draft of a %s submission of a %s indicator and ends it as withdrawn',
    (_, indicatorStatus, context) => {
      expect(nextState({ ...context, indicatorStatus }, 'withdraw')).toEqual({
        ok: true,
        state: { versionStatus: 'draft', submissionStatus: 'withdrawn', isLocked: false },
      });
    },
  );

  it('is refused in every other context', () => {
    const open = CONTEXTS.filter((context) => nextState(context, 'withdraw').ok);

    expect(open).toEqual([submitted, { ...submitted, indicatorStatus: 'live' }]);
  });

  it.each([
    ['in review', inReview],
    ['withdrawn', withdrawn],
    ['answered with changes requested', changesRequested],
    ['approved', approved],
  ])('is refused once the submission is %s', (_, context) => {
    expect(nextState(context, 'withdraw')).toEqual({ ok: false, reason: 'not_allowed' });
  });

  it('never carries reviewers into the withdrawn state', () => {
    expect(nextState(submitted, 'withdraw', { carriedReviewerCount: 1 })).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'withdrawn', isLocked: false },
    });
  });
});

const submittedUpdate = { ...submitted, indicatorStatus: 'live' } as const;

describe.each([
  ['send_update_to_imrg', 'submitted', true],
  ['request_update_revisions', 'changes_requested', false],
  ['approve_update', 'approved', true],
] as const)('%s', (step, submissionStatus, isLocked) => {
  it(`leaves a submitted update with no decision ${submissionStatus}`, () => {
    expect(nextState(submittedUpdate, step)).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus, isLocked },
    });
  });

  it('is refused in every other context, including once a decision is made', () => {
    const open = ALL_CONTEXTS.filter((context) => nextState(context, step).ok);

    expect(open).toEqual([submittedUpdate]);
  });
});

const sentToImrg = { ...submittedUpdate, latestUpdateDecision: 'imrg_review' } as const;
const updateInReview = { ...sentToImrg, latestSubmissionStatus: 'in_review' } as const;

describe('assign_reviewers', () => {
  it.each([
    ["a new indicator's submitted", submitted],
    ["a new indicator's in review", inReview],
    ["an update's sent to IMRG", sentToImrg],
    ["an update's in review", updateInReview],
  ])('puts %s submission in review, its draft still locked', (_, context) => {
    expect(nextState(context, 'assign_reviewers')).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'in_review', isLocked: true },
    });
  });

  it('is refused in every other context', () => {
    const open = ALL_CONTEXTS.filter((context) => nextState(context, 'assign_reviewers').ok);

    expect(open.filter(({ indicatorStatus }) => indicatorStatus === 'live')).toEqual([
      sentToImrg,
      updateInReview,
    ]);
    expect(CONTEXTS.filter((context) => nextState(context, 'assign_reviewers').ok)).toEqual([
      submitted,
      inReview,
    ]);
  });

  it.each([
    ['no decision', null],
    ['sent back for revisions', 'request_revisions'],
    ['approved for publishing', 'publish_with_history'],
  ] as const)('is refused for an update with %s', (_, latestUpdateDecision) => {
    expect(nextState({ ...submittedUpdate, latestUpdateDecision }, 'assign_reviewers')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });
});

describe.each([
  ['give_feedback', 'changes_requested', false, [inReview, updateInReview]],
  ['request_changes', 'changes_requested', false, [inReview]],
  ['approve', 'approved', true, [inReview, updateInReview]],
] as const)('%s', (step, submissionStatus, isLocked, opensFrom) => {
  it(`ends a new indicator's submission in review as ${submissionStatus}`, () => {
    expect(nextState(inReview, step)).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus, isLocked },
    });
  });

  it('is refused in every other context', () => {
    const open = ALL_CONTEXTS.filter(
      (context) =>
        nextState(context, step).ok &&
        (context.indicatorStatus === 'live' || context.latestUpdateDecision === null),
    );

    expect(open).toEqual(opensFrom);
  });
});

const updateSentBack = { ...changesRequested, indicatorStatus: 'live' } as const;

describe('resubmit', () => {
  it.each([
    ['a new indicator', changesRequested],
    ['an update', updateSentBack],
  ] as const)(
    "locks %s's draft sent back for changes under a new submitted submission",
    (_, context) => {
      expect(nextState(context, 'resubmit')).toEqual({
        ok: true,
        state: { versionStatus: 'draft', submissionStatus: 'submitted', isLocked: true },
      });
    },
  );

  it("starts a new indicator's submission in review when reviewers are carried over", () => {
    expect(nextState(changesRequested, 'resubmit', { carriedReviewerCount: 1 })).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'in_review', isLocked: true },
    });
  });

  it("carries no reviewers onto an update's new submission, which waits for a decision", () => {
    expect(carriesReviewers('resubmit', 'live')).toBe(false);
    expect(nextState(updateSentBack, 'resubmit', { carriedReviewerCount: 1 })).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'submitted', isLocked: true },
    });
  });

  it('is refused in every other context', () => {
    const open = CONTEXTS.filter((context) => nextState(context, 'resubmit').ok);

    expect(open).toEqual([changesRequested, updateSentBack]);
  });
});

describe('schedule', () => {
  it.each([
    ['a new indicator', approved],
    ['an update', { ...approved, indicatorStatus: 'live' }],
  ] as const)("schedules %s's approved draft, still locked and approved", (_, context) => {
    expect(nextState(context, 'schedule')).toEqual({
      ok: true,
      state: { versionStatus: 'scheduled', submissionStatus: 'approved', isLocked: true },
    });
  });

  it('is refused in every other context', () => {
    const open = CONTEXTS.filter((context) => nextState(context, 'schedule').ok);

    expect(open).toEqual([approved, { ...approved, indicatorStatus: 'live' }]);
  });
});

describe('change_publication_date', () => {
  it.each([
    ['a new indicator', scheduled],
    ['an update', { ...scheduled, indicatorStatus: 'live' }],
  ] as const)("keeps %s's scheduled version scheduled, locked and approved", (_, context) => {
    expect(nextState(context, 'change_publication_date')).toEqual({
      ok: true,
      state: { versionStatus: 'scheduled', submissionStatus: 'approved', isLocked: true },
    });
  });

  it('is refused in every other context', () => {
    const open = CONTEXTS.filter((context) => nextState(context, 'change_publication_date').ok);

    expect(open).toEqual([scheduled, { ...scheduled, indicatorStatus: 'live' }]);
  });
});

describe('publish', () => {
  it('publishes a scheduled new indicator, still locked and approved', () => {
    expect(nextState(scheduled, 'publish')).toEqual({
      ok: true,
      state: { versionStatus: 'published', submissionStatus: 'approved', isLocked: true },
    });
  });

  it('is refused in every other context', () => {
    const open = CONTEXTS.filter((context) => nextState(context, 'publish').ok);

    expect(open).toEqual([scheduled]);
  });
});

describe('allowedSteps', () => {
  it.each([
    ['a draft never submitted', unsubmitted, ['submit']],
    ['a withdrawn draft', withdrawn, ['submit']],
    ['a submitted draft', submitted, ['withdraw', 'assign_reviewers']],
    [
      'a draft in review',
      inReview,
      ['assign_reviewers', 'give_feedback', 'request_changes', 'approve'],
    ],
    ['a draft sent back for changes', changesRequested, ['resubmit']],
    ['an approved draft', approved, ['schedule']],
    ['a scheduled version', scheduled, ['change_publication_date', 'publish']],
    [
      'a submitted update with no decision',
      submittedUpdate,
      ['withdraw', 'send_update_to_imrg', 'request_update_revisions', 'approve_update'],
    ],
    ['an update sent to IMRG', sentToImrg, ['withdraw', 'assign_reviewers']],
    ['an update in review', updateInReview, ['assign_reviewers', 'give_feedback', 'approve']],
    ['an update sent back for changes', updateSentBack, ['resubmit']],
    [
      'an approved update',
      { ...approved, indicatorStatus: 'live', latestUpdateDecision: 'publish_with_history' },
      ['schedule'],
    ],
    [
      'a scheduled update',
      { ...scheduled, indicatorStatus: 'live', latestUpdateDecision: 'publish_with_history' },
      ['change_publication_date'],
    ],
    ['a published version', { ...unsubmitted, versionStatus: 'published' }, []],
  ] as const)('offers %s only the steps open to it', (_, context, steps) => {
    expect(allowedSteps(context)).toEqual(steps);
  });

  it('offers a scheduled version a change of date or publication, only while locked and approved', () => {
    const contexts = CONTEXTS.filter(({ versionStatus }) => versionStatus === 'scheduled');
    const offered = contexts.flatMap((context) =>
      allowedSteps(context).map((step) => [context, step]),
    );
    const scheduledUpdate = { ...scheduled, indicatorStatus: 'live' };

    expect(contexts).toHaveLength(2 * 2 * (INDICATOR_SUBMISSION_STATUSES.length + 1));
    expect(offered).toEqual([
      [scheduled, 'change_publication_date'],
      [scheduled, 'publish'],
      [scheduledUpdate, 'change_publication_date'],
    ]);
  });

  it('offers a published version no step at all', () => {
    const contexts = CONTEXTS.filter(({ versionStatus }) => versionStatus === 'published');

    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts.flatMap((context) => allowedSteps(context))).toEqual([]);
  });
});
