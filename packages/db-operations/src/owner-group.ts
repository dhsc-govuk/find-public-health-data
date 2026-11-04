import type postgres from 'postgres';

/**
 * Owns every application object, so ownership doesn't depend on which login runs the
 * migrations: the local superuser, or a deployed operations job's Entra principal.
 */
export const OWNER_GROUP = 'fphd_owner';

/** `public` itself stays with pg_database_owner, which a new database and `db reset` give it. */
const OWNED_SCHEMAS = ['published', 'drizzle'];
export const APP_SCHEMAS = ['public', ...OWNED_SCHEMAS];

/**
 * Creates the owner group, makes the current login a member that can act as it, and grants
 * the group what migrating needs. Idempotent, and run before every migration, which also puts
 * back the `public` grant that `db reset` drops.
 *
 * On Postgres 16+ a login that creates a role gets ADMIN on it but not INHERIT or SET, so the
 * membership is granted explicitly.
 *
 * Refuses a database migrated before the group existed. The group can't alter or reference
 * objects it doesn't own, so the migrations would otherwise fail partway with an ownership
 * error that doesn't say why.
 */
export async function prepareOwnerGroup(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      DO $$
      BEGIN
        CREATE ROLE ${OWNER_GROUP} NOLOGIN;
      -- unique_violation is what the loser of a genuinely concurrent CREATE ROLE gets.
      EXCEPTION WHEN duplicate_object OR unique_violation THEN
        NULL;
      END $$;
    `);

    const [membership] = await tx<{ ready: boolean }[]>`
      SELECT coalesce(bool_or(inherit_option) AND bool_or(set_option), false) AS ready
      FROM pg_auth_members
      WHERE roleid = ${OWNER_GROUP}::regrole AND member = current_user::text::regrole
    `;
    if (!membership?.ready) {
      await tx.unsafe(`GRANT ${OWNER_GROUP} TO CURRENT_USER WITH INHERIT TRUE, SET TRUE`);
    }

    // The migrator creates the drizzle schema, and the migrations create in public.
    const [database] = await tx<{ name: string }[]>`SELECT current_database() AS name`;
    if (!database) throw new Error('current_database() returned no row');
    await tx`GRANT CREATE ON DATABASE ${tx(database.name)} TO ${tx(OWNER_GROUP)}`;
    await tx`GRANT USAGE, CREATE ON SCHEMA public TO ${tx(OWNER_GROUP)}`;

    const foreign = await objectsOwnedByOthers(tx);
    if (foreign.length > 0) {
      throw new Error(
        `This database was migrated before ${OWNER_GROUP} owned its objects ` +
          `(${foreign.slice(0, 3).join(', ')}${foreign.length > 3 ? ', …' : ''} belong to ` +
          'another role). Reset it and migrate again: pnpm db:reset && pnpm db:migrate.',
      );
    }
  });
}

/**
 * Application schemas and relations the group doesn't own. Relations are enough to spot an old
 * database. Extension members are left out because the extension owns them.
 */
async function objectsOwnedByOthers(tx: postgres.TransactionSql): Promise<string[]> {
  const rows = await tx<{ name: string }[]>`
    SELECT 'schema ' || nspname AS name FROM pg_namespace
    WHERE nspname = ANY(${OWNED_SCHEMAS}::text[]) AND nspowner <> ${OWNER_GROUP}::regrole
    UNION ALL
    SELECT c.oid::regclass::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY(${APP_SCHEMAS}::text[])
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
      AND c.relowner <> ${OWNER_GROUP}::regrole
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
      )
    ORDER BY 1
  `;
  return rows.map(({ name }) => name);
}
