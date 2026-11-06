import type { Role } from './roles.ts';
import { TEAM_IDS } from './teams.ts';

export interface FakeUser {
  readonly id: string;
  readonly name: string;
  readonly roles: readonly Role[];
  readonly teamIds: readonly string[];
}

/**
 * The fake users' `app_user` row ids, which a migration in @fphd/db-operations inserts. That
 * migration also inserted Alex Morgan, once a public-only user, and migration 0064 removes them.
 */
export const FAKE_USER_IDS = Object.freeze({
  publisherTeamA: '01a13c69-96ab-7598-9ce0-f84dbec3d5dd',
  secondPublisherTeamA: '01a1a248-ca45-70b6-912d-21b990329653',
  publisherTeamB: '01a13c69-96ab-7598-9ce0-fc3b3433f586',
  publisherTeamsAAndB: '01a13c69-96ab-7598-9ce1-00c3f4e7a399',
  publisherAndReviewer: '01a13c69-96ab-7598-9ce1-0437fbc8b7ec',
  publisherTeamC: '01a19d3e-4a0b-7591-9eb4-83550cc19ef5',
  imrgManager: '01a13c69-96ab-7598-9ce1-0a29866e38c2',
  imrgReviewer: '01a13c69-96ac-700c-9c28-84ab06327fd0',
  secondImrgReviewer: '01a19d3e-4a04-75e3-b779-49514c791db5',
  admin: '01a13c69-96ac-700c-9c28-8a01ee1fdfa8',
});

function fakeUser(
  id: string,
  name: string,
  roles: readonly Role[],
  teamIds: readonly string[] = [],
): FakeUser {
  return Object.freeze({
    id,
    name,
    roles: Object.freeze([...roles]),
    teamIds: Object.freeze([...teamIds]),
  });
}

export const fakeUsers: readonly FakeUser[] = Object.freeze([
  fakeUser(FAKE_USER_IDS.publisherTeamA, 'Sam Taylor', ['publisher'], [TEAM_IDS.teamA]),
  fakeUser(FAKE_USER_IDS.secondPublisherTeamA, 'Charlie Owen', ['publisher'], [TEAM_IDS.teamA]),
  fakeUser(FAKE_USER_IDS.publisherTeamB, 'Jordan Lee', ['publisher'], [TEAM_IDS.teamB]),
  fakeUser(
    FAKE_USER_IDS.publisherTeamsAAndB,
    'Casey Patel',
    ['publisher'],
    [TEAM_IDS.teamA, TEAM_IDS.teamB],
  ),
  fakeUser(
    FAKE_USER_IDS.publisherAndReviewer,
    'Morgan Hughes',
    ['publisher', 'imrg-reviewer'],
    [TEAM_IDS.teamC],
  ),
  fakeUser(FAKE_USER_IDS.publisherTeamC, 'Drew Kaur', ['publisher'], [TEAM_IDS.teamC]),
  fakeUser(FAKE_USER_IDS.imrgManager, 'Avery Clarke', ['imrg-manager']),
  fakeUser(FAKE_USER_IDS.imrgReviewer, 'Jamie Evans', ['imrg-reviewer']),
  fakeUser(FAKE_USER_IDS.secondImrgReviewer, 'Robin Shaw', ['imrg-reviewer']),
  fakeUser(FAKE_USER_IDS.admin, 'Riley Singh', ['admin']),
]);

export function findFakeUser(id: string): FakeUser | undefined {
  return fakeUsers.find((user) => user.id === id);
}
