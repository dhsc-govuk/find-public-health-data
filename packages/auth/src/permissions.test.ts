import { describe, expect, it } from 'vitest';

import {
  canAssignReviewers,
  canCreateIndicator,
  canCreateIndicatorInTeam,
  canEditIndicator,
  canListIndicators,
  canManage,
  canMoveIndicatorBetweenTeams,
  canReviewIndicator,
  canReviewIndicators,
  canSeeIndicator,
  canSeeNotesForReviewers,
  canSeeTeamsAndUsers,
  canSubmitIndicator,
  canWithdrawSubmission,
  type IndicatorAccess,
  indicatorListScope,
  ownTeamsListScope,
  type SessionUser,
  teamsForNewIndicator,
} from './permissions.ts';

const teamA = 'team-a';
const teamB = 'team-b';

function user(sub: string, roles: string[], teams: string[] = []): SessionUser {
  return { roles: ['public', 'internal', ...roles], sub, teams };
}

const publisherA = user('publisher-a', ['publisher'], [teamA]);
const publisherAB = user('publisher-ab', ['publisher'], [teamA, teamB]);
const reviewer = user('reviewer', ['imrg-reviewer']);
const publisherReviewer = user('publisher-reviewer', ['publisher', 'imrg-reviewer'], [teamB]);
const manager = user('manager', ['imrg-manager']);
const admin = user('admin', ['admin']);
const publisherManager = user('publisher-manager', ['publisher', 'imrg-manager'], [teamA]);
const teamless = user('teamless', ['publisher']);

const inTeamA: IndicatorAccess = { teamId: teamA, reviewerIds: [] };
const inTeamB: IndicatorAccess = { teamId: teamB, reviewerIds: [] };
const inNoTeam: IndicatorAccess = { teamId: null, reviewerIds: [] };
const assigned: IndicatorAccess = { teamId: teamA, reviewerIds: ['reviewer'] };

describe('canSeeIndicator', () => {
  it.each([
    ['a publisher', publisherA, inTeamA, true],
    ['a publisher', publisherA, inTeamB, false],
    ['a publisher in two teams', publisherAB, inTeamB, true],
    ['a publisher', publisherA, inNoTeam, false],
    ['an IMRG reviewer', reviewer, assigned, true],
    ['an IMRG reviewer', reviewer, inTeamA, false],
    ['a publisher who reviews', publisherReviewer, inTeamB, true],
    ['an IMRG manager', manager, inNoTeam, true],
    ['an admin', admin, inTeamB, true],
  ])('answers whether %s sees an indicator', (_who, asking, indicator, expected) => {
    expect(canSeeIndicator(asking, indicator)).toBe(expected);
  });
});

describe('canEditIndicator', () => {
  it("lets a publisher edit their own teams' indicators only", () => {
    expect(canEditIndicator(publisherAB, inTeamB)).toBe(true);
    expect(canEditIndicator(publisherA, inTeamB)).toBe(false);
    expect(canEditIndicator(publisherA, inNoTeam)).toBe(false);
  });

  it('lets no one but a publisher edit', () => {
    for (const asking of [admin, manager, reviewer]) {
      expect(canEditIndicator(asking, assigned)).toBe(false);
    }
  });
});

describe.each([
  ['canSubmitIndicator', canSubmitIndicator],
  ['canWithdrawSubmission', canWithdrawSubmission],
])('%s', (_name, check) => {
  it("lets a publisher take the step on their own teams' indicators only", () => {
    expect(check(publisherAB, inTeamB)).toBe(true);
    expect(check(publisherA, inTeamB)).toBe(false);
    expect(check(publisherA, inNoTeam)).toBe(false);
  });

  it('lets no one but a publisher take it', () => {
    for (const asking of [admin, manager, reviewer]) {
      expect(check(asking, assigned)).toBe(false);
    }
  });
});

describe('canListIndicators', () => {
  it('lets anyone holding one of the four internal roles open the list', () => {
    for (const asking of [publisherA, reviewer, manager, admin]) {
      expect(canListIndicators(asking), asking.sub).toBe(true);
    }
    expect(canListIndicators(user('internal-only', []))).toBe(false);
  });
});

describe('canCreateIndicator', () => {
  it('lets a publisher with a team create an indicator', () => {
    expect(canCreateIndicator(publisherA)).toBe(true);
    expect(canCreateIndicator(teamless)).toBe(false);
    expect(canCreateIndicator(admin)).toBe(false);
  });
});

describe('teamsForNewIndicator', () => {
  it("offers a publisher's new indicator every one of their teams", () => {
    expect(teamsForNewIndicator(publisherAB)).toEqual([teamA, teamB]);
    expect(teamsForNewIndicator(publisherReviewer)).toEqual([teamB]);
    expect(teamsForNewIndicator(teamless)).toEqual([]);
    expect(teamsForNewIndicator(admin)).toEqual([]);
  });
});

describe('canCreateIndicatorInTeam', () => {
  it('lets a publisher create an indicator in their own teams only', () => {
    expect(canCreateIndicatorInTeam(publisherAB, teamB)).toBe(true);
    expect(canCreateIndicatorInTeam(publisherA, teamB)).toBe(false);
    expect(canCreateIndicatorInTeam(user('team-a-admin', ['admin'], [teamA]), teamA)).toBe(false);
  });
});

describe('canReviewIndicator', () => {
  it('lets an IMRG reviewer review the indicators assigned to them', () => {
    expect(canReviewIndicator(reviewer, assigned)).toBe(true);
    expect(canReviewIndicator(reviewer, inTeamA)).toBe(false);
    expect(canReviewIndicator(manager, assigned)).toBe(false);
  });
});

describe('canSeeNotesForReviewers', () => {
  // A publisher in team B who is also assigned to review a team B indicator.
  const assignedInOwnTeam: IndicatorAccess = { teamId: teamB, reviewerIds: ['publisher-reviewer'] };

  it.each([
    ['an IMRG manager', manager, inTeamA, true],
    ['an admin', admin, inTeamA, true],
    ['a publisher in its team', publisherA, inTeamA, true],
    ['an assigned reviewer', reviewer, assigned, true],
    ['a reviewer assigned in their own team', publisherReviewer, assignedInOwnTeam, true],
    ['a publisher in another team', publisherA, inTeamB, false],
    ['an unassigned reviewer', reviewer, inTeamA, false],
    ['a reviewer who publishes in another team, unassigned', publisherReviewer, inTeamA, false],
  ])('answers %s with %s', (_who, asking, indicator, expected) => {
    expect(canSeeNotesForReviewers(asking, indicator)).toBe(expected);
  });
});

describe('the role-wide checks', () => {
  it('lets an IMRG reviewer, whatever else they hold, be assigned indicators to review', () => {
    expect(canReviewIndicators(reviewer)).toBe(true);
    expect(canReviewIndicators(publisherReviewer)).toBe(true);
    expect(canReviewIndicators(manager)).toBe(false);
    expect(canReviewIndicators(publisherA)).toBe(false);
  });

  it('lets an IMRG manager assign reviewers', () => {
    expect(canAssignReviewers(manager)).toBe(true);
    expect(canAssignReviewers(admin)).toBe(false);
  });

  it('lets an admin, and no one else, manage the shared content', () => {
    expect(canManage(admin)).toBe(true);
    for (const asking of [publisherAB, manager, reviewer]) {
      expect(canManage(asking), asking.sub).toBe(false);
    }
  });

  it('lets an admin move indicators and see teams and users', () => {
    expect(canMoveIndicatorBetweenTeams(admin)).toBe(true);
    expect(canSeeTeamsAndUsers(admin)).toBe(true);
    expect(canMoveIndicatorBetweenTeams(publisherAB)).toBe(false);
    expect(canSeeTeamsAndUsers(manager)).toBe(false);
  });
});

describe('indicatorListScope', () => {
  it.each([
    ['an admin', admin, { all: true }],
    ['an IMRG manager', manager, { all: true }],
    ['a publisher', publisherAB, { all: false, teamIds: [teamA, teamB] }],
    ['a publisher who reviews', publisherReviewer, { all: false, teamIds: [teamB] }],
    ['an IMRG reviewer', reviewer, { all: false, teamIds: [] }],
  ])('scopes the list %s sees', (_who, asking, expected) => {
    expect(indicatorListScope(asking)).toEqual(expected);
  });

  it('holds what canSeeIndicator allows while no reviewer is assigned', () => {
    const users = [publisherA, publisherAB, reviewer, publisherReviewer, manager, admin, teamless];

    for (const asking of users) {
      const scope = indicatorListScope(asking);
      for (const indicator of [inTeamA, inTeamB, inNoTeam]) {
        const listed =
          scope.all || (indicator.teamId !== null && scope.teamIds.includes(indicator.teamId));
        expect(listed, asking.sub).toBe(canSeeIndicator(asking, indicator));
      }
    }
  });
});

describe('ownTeamsListScope', () => {
  it.each([
    ['a publisher', publisherAB, [teamA, teamB]],
    ['a publisher who manages IMRG', publisherManager, [teamA]],
    ['an IMRG manager', manager, []],
    ['an admin', admin, []],
  ])("scopes the list to %s's own teams", (_who, asking, teamIds) => {
    expect(ownTeamsListScope(asking)).toEqual({ all: false, teamIds });
  });
});
