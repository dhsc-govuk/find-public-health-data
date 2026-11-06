import { describe, expect, it } from 'vitest';

import { FAKE_USER_IDS, fakeUsers, findFakeUser } from './fake-users.ts';
import { canUseInternalService } from './permissions.ts';
import { TEAMS } from './teams.ts';

function requireFakeUser(id: string) {
  const user = findFakeUser(id);
  if (user === undefined) throw new Error(`Missing fake user ${id}`);
  return user;
}

describe('fake users', () => {
  it('offers only users who may use the internal service, the one app with sign-in', () => {
    expect(fakeUsers.filter((user) => !canUseInternalService(user))).toEqual([]);
    expect(fakeUsers.map((user) => user.name)).toEqual([
      'Sam Taylor',
      'Charlie Owen',
      'Jordan Lee',
      'Casey Patel',
      'Morgan Hughes',
      'Drew Kaur',
      'Avery Clarke',
      'Jamie Evans',
      'Robin Shaw',
      'Riley Singh',
    ]);
  });

  it('gives each internal role to at least one user', () => {
    const held = new Set(fakeUsers.flatMap((user) => user.roles));

    for (const role of ['publisher', 'imrg-manager', 'imrg-reviewer', 'admin'] as const) {
      expect(held.has(role), role).toBe(true);
    }
  });

  it('puts every publisher, and only a publisher, in a team', () => {
    for (const user of fakeUsers) {
      expect(user.teamIds.length > 0, user.name).toBe(user.roles.includes('publisher'));
    }
  });

  it('gives every team a publisher but Fingertips, which holds imported indicators', () => {
    const staffed = new Set(fakeUsers.flatMap((user) => user.teamIds));

    expect(TEAMS.filter(({ id }) => !staffed.has(id)).map(({ name }) => name)).toEqual([
      'Fingertips',
    ]);
  });

  it('keeps publisher off the admin', () => {
    expect(requireFakeUser(FAKE_USER_IDS.admin).roles).toEqual(['admin']);
  });

  it('gives every user an id of their own', () => {
    expect(new Set(fakeUsers.map((user) => user.id)).size).toBe(fakeUsers.length);
  });
});
