import { schema } from '@fphd/db';
import { INDICATOR_STATUSES } from '@fphd/utils/indicator-status';
import { INDICATOR_STEPS } from '@fphd/utils/indicator-step';
import { INDICATOR_SUBMISSION_STATUSES } from '@fphd/utils/indicator-submission-status';
import { describe, expect, it } from 'vitest';

import { allowedSteps, type IndicatorWorkflowContext, nextState } from './indicator-workflow.ts';

/**
 * Every context the workflow can be asked about: each combination of indicator status, version
 * status, lock and latest submission status, including no submission at all.
 */
const CONTEXTS: IndicatorWorkflowContext[] = INDICATOR_STATUSES.flatMap((indicatorStatus) =>
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
const scheduled = { ...approved, versionStatus: 'scheduled' } as const;

it.each(INDICATOR_STEPS)('opens %s in some context', (step) => {
  expect(CONTEXTS.some((context) => nextState(context, step).ok)).toBe(true);
});

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

  it('never carries reviewers onto the submission', () => {
    expect(nextState(withdrawn, 'submit', { carriedReviewerCount: 2 })).toEqual({
      ok: true,
      state: { versionStatus: 'draft', submissionStatus: 'submitted', isLocked: true },
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

describe('schedule', () => {
  it("schedules a new indicator's approved draft, still locked and approved", () => {
    expect(nextState(approved, 'schedule')).toEqual({
      ok: true,
      state: { versionStatus: 'scheduled', submissionStatus: 'approved', isLocked: true },
    });
  });

  it('is refused in every other context', () => {
    const open = CONTEXTS.filter((context) => nextState(context, 'schedule').ok);

    expect(open).toEqual([approved]);
  });
});

describe('change_publication_date', () => {
  it('keeps a scheduled version scheduled, locked and approved', () => {
    expect(nextState(scheduled, 'change_publication_date')).toEqual({
      ok: true,
      state: { versionStatus: 'scheduled', submissionStatus: 'approved', isLocked: true },
    });
  });

  it('is refused in every other context', () => {
    const open = CONTEXTS.filter((context) => nextState(context, 'change_publication_date').ok);

    expect(open).toEqual([scheduled]);
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
    ['a published version', { ...unsubmitted, versionStatus: 'published' }, []],
  ] as const)('offers %s only the steps open to it', (_, context, steps) => {
    expect(allowedSteps(context)).toEqual(steps);
  });

  it('offers a scheduled version a change of date or publication, only while locked and approved', () => {
    const contexts = CONTEXTS.filter(({ versionStatus }) => versionStatus === 'scheduled');
    const offered = contexts.flatMap((context) =>
      allowedSteps(context).map((step) => [context, step]),
    );

    expect(contexts).toHaveLength(2 * 2 * (INDICATOR_SUBMISSION_STATUSES.length + 1));
    expect(offered).toEqual([
      [scheduled, 'change_publication_date'],
      [scheduled, 'publish'],
    ]);
  });

  it('offers a published version no step at all', () => {
    const contexts = CONTEXTS.filter(({ versionStatus }) => versionStatus === 'published');

    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts.flatMap((context) => allowedSteps(context))).toEqual([]);
  });
});
