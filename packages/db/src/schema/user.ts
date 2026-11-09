import { sql } from 'drizzle-orm';
import { check, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { literals, timestamps, uuidPrimaryKey } from './helpers.ts';

/**
 * A `person` is someone who signs in. A `system` user stands for an import or a scheduled job, and
 * is recorded as the author of the records that import or job writes.
 */
export const APP_USER_KINDS = ['person', 'system'] as const;

export type AppUserKind = (typeof APP_USER_KINDS)[number];

/**
 * Everyone who writes records, named so other users can see who did. A person's OpenID Connect
 * identity is filled in when they first sign in through it; a system user never has one.
 */
export const appUser = pgTable(
  'app_user',
  {
    id: uuidPrimaryKey(),
    displayName: text().notNull(),
    kind: text({ enum: APP_USER_KINDS }).notNull(),
    oidcIssuer: text(),
    oidcSubject: text(),
    ...timestamps,
  },
  (t) => [
    check('app_user_kind_check', sql`${t.kind} IN (${literals(APP_USER_KINDS)})`),
    check(
      'app_user_oidc_identity_check',
      sql`(${t.oidcIssuer} IS NULL) = (${t.oidcSubject} IS NULL)`,
    ),
    check(
      'app_user_system_identity_check',
      sql`${t.kind} <> ${literals(['system' satisfies AppUserKind])} OR ${t.oidcIssuer} IS NULL`,
    ),
    unique('app_user_oidc_identity_unique').on(t.oidcIssuer, t.oidcSubject),
  ],
);

/**
 * The system users that imports and scheduled publication act as. Migrations insert these users
 * with these fixed ids.
 */
export const SYSTEM_USER_IDS = Object.freeze({
  pholioMigration: '01a13c69-96ab-7598-9ce0-f0c3bd77bded',
  testSeed: '01a13c69-96ab-7598-9ce0-f5fa1e68080a',
  coreDataImport: '01a154fb-1a99-7705-9016-05db53119b93',
  scheduledPublication: '01a1ad2e-22f2-7894-b161-c39055b37600',
});

/** Who wrote a row: an `app_user`. */
export const actorId = () => uuid().references(() => appUser.id);

export const audit = {
  ...timestamps,
  createdBy: actorId().notNull(),
  updatedBy: actorId().notNull(),
};
