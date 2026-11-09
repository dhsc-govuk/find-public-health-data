import { describe, expect, it } from 'vitest';

import { INDICATOR_STEPS } from './contract.ts';
import { type IndicatorWorkflowRow, mayTakeStep, stepsOpenTo } from './indicator-workflow.ts';

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
const approvedRow: IndicatorWorkflowRow = {
  ...inReviewRow,
  draftSubmissionStatus: 'approved',
};
const scheduledRow: IndicatorWorkflowRow = { ...approvedRow, draftStatus: 'scheduled' };
const RESPONSE_STEPS = ['give_feedback', 'request_changes', 'approve'] as const;

describe('mayTakeStep', () => {
  const inTeam = { teamId: TEAM, reviewerIds: [] };
  const assigned = { teamId: TEAM, reviewerIds: ['reviewer'] };

  it.each(INDICATOR_STEPS)('says who may take %s', (step) => {
    expect(typeof mayTakeStep(admin, assigned, step)).toBe('boolean');
  });

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

  it.each(['schedule', 'change_publication_date'] as const)('lets an admin alone %s', (step) => {
    expect(mayTakeStep(admin, inTeam, step)).toBe(true);
    for (const user of [publisher, manager, reviewer, publishingReviewer]) {
      expect(mayTakeStep(user, assigned, step)).toBe(false);
    }
  });

  it('lets no user publish', () => {
    for (const user of [publisher, admin, manager, reviewer, publishingReviewer]) {
      expect(mayTakeStep(user, assigned, 'publish')).toBe(false);
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

  it.each([
    ['confirm the publication date of an approved draft', approvedRow, ['schedule']],
    [
      'change the publication date of a scheduled version',
      scheduledRow,
      ['change_publication_date'],
    ],
  ] as const)('lets an admin %s, and nobody else', (_, row, steps) => {
    expect(stepsOpenTo(admin, row)).toEqual(steps);
    for (const user of [publisher, manager, reviewer]) {
      expect(stepsOpenTo(user, row)).toEqual([]);
    }
  });

  it('offers nobody the publication of a scheduled version', () => {
    for (const user of [publisher, admin, manager, reviewer, publishingReviewer]) {
      expect(stepsOpenTo(user, scheduledRow)).not.toContain('publish');
    }
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
