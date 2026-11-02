import type { AppAudience } from './audience.ts';
import type { Role } from './roles.ts';
import { TEAM_IDS } from './teams.ts';

export interface FakeUser {
  readonly id: string;
  readonly name: string;
  readonly roles: readonly Role[];
  readonly teamIds: readonly string[];
}

/** The fake users' `app_user` row ids, which a migration in @fphd/db-operations inserts. */
export const FAKE_USER_IDS = Object.freeze({
  publicUser: '01a13c69-96ac-700c-9c28-8f3a1d3968e2',
  publisherTeamA: '01a13c69-96ab-7598-9ce0-f84dbec3d5dd',
  publisherTeamB: '01a13c69-96ab-7598-9ce0-fc3b3433f586',
  publisherTeamsAAndB: '01a13c69-96ab-7598-9ce1-00c3f4e7a399',
  publisherAndReviewer: '01a13c69-96ab-7598-9ce1-0437fbc8b7ec',
  imrgManager: '01a13c69-96ab-7598-9ce1-0a29866e38c2',
  imrgReviewer: '01a13c69-96ac-700c-9c28-84ab06327fd0',
  secondImrgReviewer: '01a19d3e-4a04-75e3-b779-49514c791db5',
  admin: '01a13c69-96ac-700c-9c28-8a01ee1fdfa8',
});

const INTERNAL: readonly Role[] = ['public', 'internal'];

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
  fakeUser(FAKE_USER_IDS.publicUser, 'Alex Morgan', ['public']),
  fakeUser(
    FAKE_USER_IDS.publisherTeamA,
    'Sam Taylor',
    [...INTERNAL, 'publisher'],
    [TEAM_IDS.teamA],
  ),
  fakeUser(
    FAKE_USER_IDS.publisherTeamB,
    'Jordan Lee',
    [...INTERNAL, 'publisher'],
    [TEAM_IDS.teamB],
  ),
  fakeUser(
    FAKE_USER_IDS.publisherTeamsAAndB,
    'Casey Patel',
    [...INTERNAL, 'publisher'],
    [TEAM_IDS.teamA, TEAM_IDS.teamB],
  ),
  fakeUser(
    FAKE_USER_IDS.publisherAndReviewer,
    'Morgan Hughes',
    [...INTERNAL, 'publisher', 'imrg-reviewer'],
    [TEAM_IDS.teamC],
  ),
  fakeUser(FAKE_USER_IDS.imrgManager, 'Avery Clarke', [...INTERNAL, 'imrg-manager']),
  fakeUser(FAKE_USER_IDS.imrgReviewer, 'Jamie Evans', [...INTERNAL, 'imrg-reviewer']),
  fakeUser(FAKE_USER_IDS.secondImrgReviewer, 'Robin Shaw', [...INTERNAL, 'imrg-reviewer']),
  fakeUser(FAKE_USER_IDS.admin, 'Riley Singh', [...INTERNAL, 'admin']),
]);

export function canAccessAudience(user: FakeUser, audience: AppAudience): boolean {
  return audience === 'public' || user.roles.includes('internal');
}

export function fakeUsersForAudience(audience: AppAudience): readonly FakeUser[] {
  return fakeUsers.filter((user) => canAccessAudience(user, audience));
}

export interface SessionAccess {
  readonly roles: readonly string[];
  readonly teams: readonly string[];
}

/** What a session for the audience grants: a public session holds no internal role or team. */
export function sessionAccessForAudience(user: FakeUser, audience: AppAudience): SessionAccess {
  return audience === 'public'
    ? Object.freeze({
        roles: Object.freeze(user.roles.filter((role) => role === 'public')),
        teams: Object.freeze([]),
      })
    : Object.freeze({ roles: user.roles, teams: user.teamIds });
}

export function findFakeUser(id: string): FakeUser | undefined {
  return fakeUsers.find((user) => user.id === id);
}
