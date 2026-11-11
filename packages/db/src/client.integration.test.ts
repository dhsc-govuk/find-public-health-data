import postgres from 'postgres';
import { afterEach, describe, expect, it } from 'vitest';

import { createDb, type Database, pingDb } from './client.ts';
import { resolveDbTls } from './env.ts';
import { loadOwnerEnv } from './testing.ts';

const env = loadOwnerEnv();

const opened: Database[] = [];

function connect(password: string): Database {
  const db = createDb({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: 'postgres',
    user: env.POSTGRES_USER,
    password,
    ssl: resolveDbTls(env.APP_ENV, env.DB_TLS),
  });
  opened.push(db);
  return db;
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((db) => db.$client.end()));
});

describe('createDb', () => {
  it('opens API connections without query compilation overhead', async () => {
    const db = connect(env.POSTGRES_PASSWORD);
    const [row] = await db.$client`show jit`;
    expect(row?.jit).toBe('off');
  });
});

describe('pingDb', () => {
  it('resolves against a database that accepts the login', async () => {
    await expect(pingDb(connect(env.POSTGRES_PASSWORD))).resolves.toBeUndefined();
  });

  it('rejects with the server error code when the login is refused', async () => {
    await expect(pingDb(connect('wrong-password'))).rejects.toMatchObject({
      code: '28P01',
    });
  });
});

// An Entra token fetch that fails rejects the password function. postgres.js left that rejection
// unhandled, which ends the process, until patches/postgres@3.4.9.patch.
describe('a password function that rejects', () => {
  it('fails the query with its error, not the process', async () => {
    const sql = postgres({
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: 'postgres',
      username: env.POSTGRES_USER,
      pass: () => Promise.reject(new Error('no token for this identity')),
      ssl: resolveDbTls(env.APP_ENV, env.DB_TLS),
      max: 1,
      connect_timeout: 5,
    });
    try {
      await expect(sql`select 1`).rejects.toThrow('no token for this identity');
    } finally {
      await sql.end({ timeout: 1 });
    }
  });
});
