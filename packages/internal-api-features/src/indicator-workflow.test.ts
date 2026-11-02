import { schema } from '@fphd/db';
import { INDICATOR_SUBMISSION_STATUSES } from '@fphd/utils/indicator-submission-status';
import { describe, expect, it } from 'vitest';

import { indicatorStatusSchema } from './contract.ts';
import {
  allowedSteps,
  type IndicatorWorkflowContext,
  type IndicatorWorkflowRow,
  mayTakeStep,
  nextState,
  stepsOpenTo,
} from './indicator-workflow.ts';

/** Every context the workflow can be asked about. */
const CONTEXTS: IndicatorWorkflowContext[] = indicatorStatusSchema.options.flatMap(
  (indicatorStatus) =>
    schema.INDICATOR_VERSION_STATUSES.flatMap((versionStatus) =>
      [false, true].flatMap((isLocked) =>
        [null, ...INDICATOR_SUBMISSION_STATUSES].map((latestSubmissionStatus) => ({
          indicatorStatus,
          versionStatus,
          isLocked,
          latestSubmissionStatus,
        })),
      ),
    ),
);

const unsubmitted: IndicatorWorkflowContext = {
  indicatorStatus: 'new',
  versionStatus: 'draft',
  isLocked: false,
  latestSubmissionStatus: null,
};
const withdrawn = { ...unsubmitted, latestSubmissionStatus: 'withdrawn' } as const;
const submitted = { ...unsubmitted, isLocked: true, latestSubmissionStatus: 'submitted' } as const;
const inReview = { ...submitted, latestSubmissionStatus: 'in_review' } as const;
const changesRequested = { ...unsubmitted, latestSubmissionStatus: 'changes_requested' } as const;
const approved = { ...submitted, latestSubmissionStatus: 'approved' } as const;

describe('submit', () => {
  it.each([
    ['never submitted', unsubmitted],
    ['withdrawn', withdrawn],
  ])("locks a new indicator's %s draft under a submitted submission", (_, context) => {
    expect(nextState(context, 'submit')).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'submitted', isLocked: true },
    });
  });

  it('starts the submission in review when reviewers are carried over', () => {
    expect(nextState(withdrawn, 'submit', { carriedReviewerCount: 2 })).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'in_review', isLocked: true },
    });
  });

  it('is refused in every other context', () => {
    const open = CONTEXTS.filter((context) => nextState(context, 'submit').ok);

    expect(open).toEqual([unsubmitted, withdrawn]);
  });

  it('is refused for the draft of a live indicator', () => {
    expect(nextState({ ...unsubmitted, indicatorStatus: 'live' }, 'submit')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });
});

describe('withdraw', () => {
  it.each([
    ['submitted', 'new', submitted],
    ['submitted', 'live', submitted],
    ['in review', 'new', inReview],
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

    expect(open).toEqual([
      submitted,
      inReview,
      { ...submitted, indicatorStatus: 'live' },
      { ...inReview, indicatorStatus: 'live' },
    ]);
  });

  it.each([
    ['withdrawn', withdrawn],
    ['answered with changes requested', changesRequested],
    ['approved', approved],
  ])('is refused once the submission is %s', (_, context) => {
    expect(nextState(context, 'withdraw')).toEqual({ ok: false, reason: 'not_allowed' });
  });

  it('never carries reviewers into the withdrawn state', () => {
    expect(nextState(inReview, 'withdraw', { carriedReviewerCount: 1 })).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'withdrawn', isLocked: false },
    });
  });
});

describe('assign_reviewers', () => {
  it.each([
    ['submitted', submitted],
    ['in review', inReview],
  ])("puts a new indicator's %s submission in review, its draft still locked", (_, context) => {
    expect(nextState(context, 'assign_reviewers')).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'in_review', isLocked: true },
    });
  });

  it('is refused in every other context', () => {
    const open = CONTEXTS.filter((context) => nextState(context, 'assign_reviewers').ok);

    expect(open).toEqual([submitted, inReview]);
  });

  it('is refused for the draft of a live indicator', () => {
    expect(nextState({ ...submitted, indicatorStatus: 'live' }, 'assign_reviewers')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });
});

describe.each([
  ['give_feedback', 'changes_requested', false],
  ['request_changes', 'changes_requested', false],
  ['approve', 'approved', true],
] as const)('%s', (step, submissionStatus, isLocked) => {
  it(`ends a new indicator's submission in review as ${submissionStatus}`, () => {
    expect(nextState(inReview, step)).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus, isLocked },
    });
  });

  it('is refused in every other context', () => {
    const open = CONTEXTS.filter((context) => nextState(context, step).ok);

    expect(open).toEqual([inReview]);
  });
});

describe('resubmit', () => {
  it("locks a new indicator's draft sent back for changes under a new submitted submission", () => {
    expect(nextState(changesRequested, 'resubmit')).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'submitted', isLocked: true },
    });
  });

  it('starts the submission in review when reviewers are carried over', () => {
    expect(nextState(changesRequested, 'resubmit', { carriedReviewerCount: 1 })).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'in_review', isLocked: true },
    });
  });

  it('is refused in every other context', () => {
    const open = CONTEXTS.filter((context) => nextState(context, 'resubmit').ok);

    expect(open).toEqual([changesRequested]);
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
      ['withdraw', 'assign_reviewers', 'give_feedback', 'request_changes', 'approve'],
    ],
    ['a draft sent back for changes', changesRequested, ['resubmit']],
    ['an approved draft', approved, []],
    ['a published version', { ...unsubmitted, versionStatus: 'published' }, []],
  ] as const)('offers %s only the steps open to it', (_, context, steps) => {
    expect(allowedSteps(context)).toEqual(steps);
  });
});

const TEAM = '00000000-0000-7000-8000-00000000000a';
const publisher = { roles: ['publisher'], sub: 'publisher', teams: [TEAM] };
const otherTeam = { ...publisher, teams: ['00000000-0000-7000-8000-00000000000b'] };
const admin = { roles: ['admin'], sub: 'admin', teams: [] };
const manager = { roles: ['imrg-manager'], sub: 'manager', teams: [] };
const reviewer = { roles: ['imrg-reviewer'], sub: 'reviewer', teams: [] };
const otherReviewer = { ...reviewer, sub: 'other-reviewer' };
const publishingReviewer = {
  roles: ['publisher', 'imrg-reviewer'],
  sub: 'reviewer',
  teams: [TEAM],
};

const unsubmittedRow: IndicatorWorkflowRow = {
  teamId: TEAM,
  draftReviewers: [],
  indicatorStatus: 'new',
  draftStatus: 'draft',
  draftLocked: false,
  draftSubmissionStatus: null,
};
const submittedRow: IndicatorWorkflowRow = {
  ...unsubmittedRow,
  draftLocked: true,
  draftSubmissionStatus: 'submitted',
};
const inReviewRow: IndicatorWorkflowRow = {
  ...submittedRow,
  draftSubmissionStatus: 'in_review',
  draftReviewers: [{ id: 'reviewer', name: 'A reviewer' }],
};
const changesRequestedRow: IndicatorWorkflowRow = {
  ...inReviewRow,
  draftLocked: false,
  draftSubmissionStatus: 'changes_requested',
};
const RESPONSE_STEPS = ['give_feedback', 'request_changes', 'approve'] as const;

describe('mayTakeStep', () => {
  const inTeam = { teamId: TEAM, reviewerIds: [] };
  const assigned = { teamId: TEAM, reviewerIds: ['reviewer'] };

  it.each(['submit', 'withdraw', 'resubmit'] as const)(
    "lets a publisher %s their own team's indicator only",
    (step) => {
      expect(mayTakeStep(publisher, inTeam, step)).toBe(true);
      expect(mayTakeStep(otherTeam, inTeam, step)).toBe(false);
      expect(mayTakeStep(admin, inTeam, step)).toBe(false);
      expect(mayTakeStep(manager, inTeam, step)).toBe(false);
      expect(mayTakeStep(reviewer, assigned, step)).toBe(false);
    },
  );

  it('lets an IMRG manager alone assign reviewers', () => {
    expect(mayTakeStep(manager, inTeam, 'assign_reviewers')).toBe(true);
    for (const user of [publisher, admin, reviewer]) {
      expect(mayTakeStep(user, assigned, 'assign_reviewers')).toBe(false);
    }
  });

  it.each(RESPONSE_STEPS)('lets an assigned reviewer alone %s', (step) => {
    expect(mayTakeStep(reviewer, assigned, step)).toBe(true);
    for (const user of [otherReviewer, publisher, manager, admin]) {
      expect(mayTakeStep(user, assigned, step)).toBe(false);
    }
  });
});

describe('stepsOpenTo', () => {
  it.each([
    ['submit a draft never submitted', unsubmittedRow, ['submit']],
    ['withdraw a submitted draft', submittedRow, ['withdraw']],
  ] as const)("lets a publisher in the indicator's team %s", (_, row, steps) => {
    expect(stepsOpenTo(publisher, row)).toEqual(steps);
  });

  it.each([
    ['assign reviewers to a submitted draft', submittedRow],
    ['change the reviewers of a draft in review', inReviewRow],
  ] as const)('lets an IMRG manager %s', (_, row) => {
    expect(stepsOpenTo(manager, row)).toEqual(['assign_reviewers']);
  });

  it('lets a publisher withdraw a draft in review', () => {
    expect(stepsOpenTo(publisher, inReviewRow)).toEqual(['withdraw']);
  });

  it('lets a publisher resubmit a draft sent back for changes', () => {
    expect(stepsOpenTo(publisher, changesRequestedRow)).toEqual(['resubmit']);
  });

  it('lets an assigned reviewer respond to a draft in review, and nothing more', () => {
    expect(stepsOpenTo(reviewer, inReviewRow)).toEqual([...RESPONSE_STEPS]);
    expect(stepsOpenTo(reviewer, changesRequestedRow)).toEqual([]);
    expect(stepsOpenTo(otherReviewer, inReviewRow)).toEqual([]);
  });

  it("lets a reviewer in the indicator's team respond as well as withdraw", () => {
    expect(stepsOpenTo(publishingReviewer, inReviewRow)).toEqual(['withdraw', ...RESPONSE_STEPS]);
  });

  it('offers no step to a user who may not take it', () => {
    for (const user of [otherTeam, admin]) {
      expect(stepsOpenTo(user, unsubmittedRow)).toEqual([]);
      expect(stepsOpenTo(user, submittedRow)).toEqual([]);
      expect(stepsOpenTo(user, inReviewRow)).toEqual([]);
    }
  });

  it('offers no step while the indicator has no draft', () => {
    const published = { ...unsubmittedRow, indicatorStatus: 'live', draftStatus: null } as const;

    expect(stepsOpenTo(publisher, published)).toEqual([]);
  });
});
