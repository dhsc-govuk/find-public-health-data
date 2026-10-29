import type { AddressInfo } from 'node:net';
import { createServer, type Socket } from 'node:net';

import { describe, expect, it } from 'vitest';

import {
  closeDatabase,
  createDb,
  createPostgresClient,
  type DbConnection,
  pingDatabase,
} from './client.ts';

// postgres.js connects lazily, so building a client touches no database.
const connection: DbConnection = {
  host: 'db.example',
  port: 5432,
  database: 'fphd',
  user: 'public_api',
  password: 'pw',
  ssl: true,
};

describe('createPostgresClient', () => {
  it('passes ssl through as a boolean, never a string postgres.js would downgrade', () => {
    expect(createPostgresClient(connection).options.ssl).toBe(true);
    expect(createPostgresClient({ ...connection, ssl: false }).options.ssl).toBe(false);
  });

  it('does not let the options bag reach a connection field', () => {
    // Deliberately ill-typed: the type already forbids this, and the point of the test is
    // that the runtime does too, so a caller cannot turn TLS back off through the back door.
    const client = createPostgresClient(connection, {
      ssl: false,
      host: 'attacker.example',
    } as never);

    expect(client.options.ssl).toBe(true);
    expect(client.options.host).toEqual(['db.example']);
  });

  it('still applies options that name no connection field', () => {
    const client = createPostgresClient(connection, { max: 1 });

    expect(client.options.max).toBe(1);
    expect(client.options.ssl).toBe(true);
  });
});

describe('closeDatabase', () => {
  it('returns while a connection is still opening, as against a database that never answers', async () => {
    const sockets: Socket[] = [];
    const silent = createServer((socket) => sockets.push(socket));
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const { port } = silent.address() as AddressInfo;
    const db = createDb({ ...connection, host: '127.0.0.1', port, ssl: false });

    const ping = pingDatabase(db).catch(() => {});
    await expect.poll(() => sockets.length).toBe(1);
    const started = Date.now();
    await closeDatabase(db);

    expect(Date.now() - started).toBeLessThan(3_000);
    await ping;
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => silent.close(resolve));
  });
});
