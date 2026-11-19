import { fakeUsers, TEAMS } from '@fphd/auth';
import { type Database, schema } from '@fphd/db';
import { sql } from 'drizzle-orm';

import { summarizeUpsert, type UpsertSummary } from './topic-import.ts';

const { appUser, team } = schema;

export interface FakeUserUpsertResult {
  teams: UpsertSummary;
  users: UpsertSummary;
}

/**
 * Upserts the teams and the fake people from `@fphd/auth`, matched on id. The internal apps sign
 * the fake people in by these ids until sign-in goes through Entra, so every environment needs
 * them. Like the rest of the core data, a rerun changes nothing and a row absent from the list is
 * left in place.
 */
export async function upsertFakeUsers(db: Database): Promise<FakeUserUpsertResult> {
  return db.transaction(async (tx) => {
    const teams = await tx
      .insert(team)
      .values(TEAMS.map(({ id, name }) => ({ id, name })))
      .onConflictDoUpdate({
        target: team.id,
        set: { name: sql`excluded.name`, updatedAt: sql`now()` },
        setWhere: sql`${team.name} IS DISTINCT FROM excluded.name`,
      })
      .returning({ id: team.id, wasInsert: sql<boolean>`xmax = 0` });

    const users = await tx
      .insert(appUser)
      .values(fakeUsers.map(({ id, name }) => ({ id, displayName: name, kind: 'person' as const })))
      .onConflictDoUpdate({
        target: appUser.id,
        set: { displayName: sql`excluded.display_name`, updatedAt: sql`now()` },
        setWhere: sql`${appUser.displayName} IS DISTINCT FROM excluded.display_name`,
      })
      .returning({ id: appUser.id, wasInsert: sql<boolean>`xmax = 0` });

    return {
      teams: summarizeUpsert(TEAMS.length, teams),
      users: summarizeUpsert(fakeUsers.length, users),
    };
  });
}
