import type postgres from 'postgres';

export interface DatabaseRole {
  name: string;
  password: string;
}

/**
 * Fixed, because the deployed configuration injects passwords for these names and nothing
 * else. Named here rather than in the app so the grant migrations and the bootstrap cannot
 * disagree about them.
 */
export const API_ROLES = {
  publicApi: 'public_api',
  internalApi: 'internal_api',
} as const;

/**
 * Creates the login roles the APIs connect as, on any server — the local compose database
 * and a managed one bootstrap through this same function. Idempotent, so it can be run
 * against a fresh server or an existing one, and it sets the password every time so the
 * same command also rotates a credential.
 *
 * `CREATE ROLE` is attempted and its duplicate errors swallowed rather than guarded by a
 * `SELECT FROM pg_roles` first — roles are cluster-wide, so two jobs bootstrapping at once
 * would both pass such a check and one would then fail.
 *
 * The whole set commits in one transaction: concurrent jobs serialise on the role rows and
 * the later committer wins for every role, so the pair cannot end up split between two
 * secret sets — and a failure on any role rotates nothing.
 *
 * The password reaches the server as a bind parameter and is quoted by Postgres itself
 * (`format('%L')`). Interpolating it into the statement text would break on a quote
 * character and would let the value inject SQL; it would also write the password into
 * anything logging statement text, which `current_setting` avoids.
 */
export async function bootstrapRoles(
  sql: postgres.Sql,
  roles: readonly DatabaseRole[],
): Promise<void> {
  await sql.begin(async (tx) => {
    for (const role of roles) {
      await tx`SELECT set_config('fphd.bootstrap_role', ${role.name}, true)`;
      await tx`SELECT set_config('fphd.bootstrap_password', ${role.password}, true)`;
      await tx.unsafe(`
        DO $$
        DECLARE
          role_name text := current_setting('fphd.bootstrap_role');
          role_password text := current_setting('fphd.bootstrap_password');
        BEGIN
          BEGIN
            EXECUTE format('CREATE ROLE %I LOGIN', role_name);
          -- unique_violation is what the loser of a genuinely concurrent CREATE ROLE gets.
          EXCEPTION WHEN duplicate_object OR unique_violation THEN
            NULL;
          END;
          EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', role_name, role_password);
        END $$;
      `);
    }
  });
}

export interface EntraPrincipal {
  /** The role the principal joins, which holds the grants: public_api or internal_api. */
  group: string;
  /** The principal's role name, which the app connects as. */
  name: string;
  /** The managed identity's object (principal) ID in Entra. */
  objectId: string;
}

/**
 * The Entra counterpart of `bootstrapRoles`, for a server that only accepts Entra sign-in. Makes
 * each group a role with no login, creates a principal for each app's managed identity, and
 * adds the principal to its group. Idempotent, and run as the server's Entra admin, the only
 * role that can create principals.
 *
 * `pgaadauth_create_principal_with_oid` takes the identity's object ID rather than looking a
 * name up in Entra, so the role name is ours to choose. Azure provides it in the `postgres`
 * database, which `sql` must be connected to. It is called unqualified so that the
 * integration test can supply a stand-in.
 */
export async function bootstrapEntraPrincipals(
  sql: postgres.Sql,
  principals: readonly EntraPrincipal[],
): Promise<void> {
  await sql.begin(async (tx) => {
    for (const principal of principals) {
      await tx`SELECT set_config('fphd.bootstrap_group', ${principal.group}, true)`;
      await tx`SELECT set_config('fphd.bootstrap_principal', ${principal.name}, true)`;
      await tx`SELECT set_config('fphd.bootstrap_object_id', ${principal.objectId}, true)`;
      await tx.unsafe(`
        DO $$
        DECLARE
          group_name text := current_setting('fphd.bootstrap_group');
          principal_name text := current_setting('fphd.bootstrap_principal');
          object_id text := current_setting('fphd.bootstrap_object_id');
        BEGIN
          BEGIN
            EXECUTE format('CREATE ROLE %I NOLOGIN', group_name);
          EXCEPTION WHEN duplicate_object OR unique_violation THEN
            NULL;
          END;
          EXECUTE format('ALTER ROLE %I NOLOGIN', group_name);
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = principal_name) THEN
            PERFORM pgaadauth_create_principal_with_oid(
              principal_name, object_id, 'service', false, false
            );
          END IF;
          EXECUTE format('GRANT %I TO %I', group_name, principal_name);
        END $$;
      `);
    }
  });
}
