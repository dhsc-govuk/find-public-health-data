import { afterEach, describe, expect, it } from 'vitest';

import { createDb, type Database, pingDatabase } from './client.ts';
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

describe('pingDatabase', () => {
  it('resolves against a database that accepts the login', async () => {
    await expect(pingDatabase(connect(env.POSTGRES_PASSWORD))).resolves.toBeUndefined();
  });

  it('rejects with the server error code when the login is refused', async () => {
    await expect(pingDatabase(connect('wrong-password'))).rejects.toMatchObject({
      code: '28P01',
    });
  });
});
