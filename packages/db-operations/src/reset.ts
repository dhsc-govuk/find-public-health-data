import type postgres from 'postgres';

/**
 * Return the database to the state of a freshly created one, so `db migrate` rebuilds it
 * from empty. Recreating the public schema wholesale beats dropping objects one kind at a
 * time: there is no catalog sweep to keep in step with whatever object kinds migrations
 * create next. What `CREATE SCHEMA` cannot restore is put back explicitly — a new
 * database owns public through pg_database_owner and grants USAGE to PUBLIC. The
 * extensions go with the schema; the first migration reinstalls them. Roles are never
 * touched — `db bootstrap` owns those. Callers own the safety decision, via
 * assertResetAllowed.
 */
export async function resetDatabase(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (tx) => {
    // The migrator's watermark lives here; left behind it would make migrate skip the
    // migrations that rebuild what was just dropped.
    await tx`DROP SCHEMA IF EXISTS drizzle CASCADE`;
    // Dropping public takes the views with it but leaves the schemas behind, and the next
    // migrate fails on CREATE SCHEMA.
    await tx`DROP SCHEMA IF EXISTS published CASCADE`;
    await tx`DROP SCHEMA IF EXISTS preview CASCADE`;
    await tx`DROP SCHEMA IF EXISTS public CASCADE`;
    await tx`CREATE SCHEMA public`;
    await tx`ALTER SCHEMA public OWNER TO pg_database_owner`;
    await tx`GRANT USAGE ON SCHEMA public TO PUBLIC`;
  });
}
