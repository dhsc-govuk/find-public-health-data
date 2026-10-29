import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index.ts';

export type Schema = typeof schema;
// This package and `@fphd/db-operations` hand out raw handles — `createOwnerClient` returns one
// and `rebuildReadModels` takes one — so consumers need a name for the type without taking a
// dependency on `postgres` themselves. Exported from the package index for that reason; the
// modules in here import `postgres` directly and have no use for the alias.
export type SqlClient = postgres.Sql;
// $client is exposed so callers can end the connection explicitly, as the API servers do on
// shutdown, instead of leaving the process to hang on an open socket.
export type Database = PostgresJsDatabase<Schema> & { $client: postgres.Sql };

export interface DbConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

/**
 * `ssl` is passed as a boolean, never the string 'require': postgres.js maps 'require' to
 * `rejectUnauthorized: false`, which encrypts the connection but authenticates nothing, so
 * it would accept any certificate presented. `true` verifies the chain against Node's
 * bundled CA store, which already holds the roots Azure's Postgres certificates chain to —
 * so no CA bundle has to be shipped in the image.
 */
export function createPostgresClient(
  connection: DbConnection,
  options: postgres.Options<Record<string, never>> = {},
): postgres.Sql {
  // The connection spreads last so `options` cannot reach a connection field. Nothing needs
  // to, and an options bag that could quietly turn `ssl` back off would undo the point of
  // routing every caller through here.
  return postgres({
    ...options,
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.user,
    password: connection.password,
    ssl: connection.ssl,
  });
}

/**
 * Create a Drizzle client for the given connection. Each API passes its own role, so it
 * connects as its own database user.
 */
export function createDb(connection: DbConnection): Database {
  return drizzle(createPostgresClient(connection), { schema, casing: 'snake_case' });
}

/** Rejects when the database refuses the connection or the login, or cannot be reached. */
export async function pingDatabase(db: Database): Promise<void> {
  await db.$client`select 1`;
}

/** Bounded, because a connection still opening, such as the start-up ping's, holds `end()` open. */
export async function closeDatabase(db: Database): Promise<void> {
  await db.$client.end({ timeout: 1 });
}

/**
 * A Drizzle handle over an already-open client, for callers that own the connection.
 * Constructing it mutates the client: drizzle writes transparent date/time parsers into
 * `client.options`, so from then on raw queries on the same client return timestamp and
 * date columns as strings, not Dates. Raw readers of date/time columns on a shared client
 * must cast (`::text`) and parse explicitly. It also makes the json and jsonb serialisers
 * pass-throughs, since drizzle stringifies those values itself, so a raw `json()` value on
 * the client is no longer serialised, and a client drizzle never wrapped stringifies
 * drizzle's JSON a second time. JSON written through both kinds of client should go as
 * text cast to jsonb (`::text::jsonb`), as `recordAudit` does.
 */
export function createDbFromClient(client: postgres.Sql): Database {
  return drizzle(client, { schema, casing: 'snake_case' });
}

/**
 * A Drizzle handle over an open transaction, so repository functions can run inside a
 * transaction the caller composes with other work. The cast is sound for queries — drizzle
 * executes them through `unsafe`, which a transaction carries — but two limits follow.
 * The handle's own `transaction()` would call `begin`, which a transaction lacks, so
 * callers must not start one. And drizzle's constructor writes transparent parsers into
 * `client.options`, which a transaction does not carry either — result parsing was fixed
 * by the parent client at connect time — so a facade over the transaction gives the
 * constructor a throwaway options bag to write into, leaving the caller's `tx` untouched,
 * but columns drizzle expects raw (timestamps) arrive driver-parsed. Callers must read
 * only values both parse identically: uuids, integers, text.
 */
export function createDbFromTransaction(tx: postgres.TransactionSql): Database {
  const facade = Object.assign(Object.create(tx), {
    options: { parsers: {}, serializers: {} },
  });
  return drizzle(facade as postgres.Sql, { schema, casing: 'snake_case' });
}
