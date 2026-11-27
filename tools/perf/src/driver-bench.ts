import { readFileSync } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';

import { sql as drizzleSql, eq } from 'drizzle-orm';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePostgresJs } from 'drizzle-orm/postgres-js';
import pg from 'pg';
import { from as copyFrom, to as copyTo } from 'pg-copy-streams';
import postgres from 'postgres';

import { type Measurement, markdownTable, roundOrder, summarise } from './driver-bench-report.ts';

/**
 * Times postgres.js against node-postgres (pg, with pg-copy-streams for COPY) on the same
 * database. Each round runs every case once per variant, in an order that moves along by one
 * variant each round, so drift in the machine or the server spreads across all of them.
 */

const { values: args } = parseArgs({
  options: {
    rounds: { type: 'string', default: '30' },
    'warm-up': { type: 'string', default: '3' },
    out: { type: 'string', default: 'driver-bench.json' },
  },
});
const ROUNDS = Number(args.rounds);
const WARM_UP = Number(args['warm-up']);

const SEQUENTIAL_QUERIES = 100;
const CONCURRENT_QUERIES = 200;
const SMALL_COPIES = 200;
const TRANSACTIONS = 50;
const ROWS_READ = 100_000;
const ITEMS = 10_000;
const COUNTERS = 1_000;
const COPY_CHUNK_BYTES = 64 * 1024;

const seedFile = path.resolve(
  import.meta.dirname,
  '../../../packages/db-operations/data/seed/observation.csv.gz',
);

const connection = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'fphd',
  user: process.env.POSTGRES_USER ?? 'fphd',
  password: process.env.POSTGRES_PASSWORD ?? '',
};
if (connection.password === '') throw new Error('POSTGRES_PASSWORD is not set');

const benchItem = pgTable('bench_item', {
  id: integer().primaryKey(),
  name: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

/** What every case needs of one database session. */
interface Session {
  selectOne(): Promise<unknown>;
  selectItem(id: number): Promise<unknown>;
  selectValue(n: number): Promise<unknown>;
  shortTransaction(id: number): Promise<void>;
  /** Runs `count` two-row COPYs in one transaction and answers how long each took. */
  smallCopies(count: number): Promise<number[]>;
  copyIn(chunks: readonly Buffer[]): Promise<void>;
  /** Answers how many bytes the COPY sent. */
  copyOut(): Promise<number>;
  /** Answers how many rows arrived. */
  readRows(limit: number): Promise<number>;
}

interface DrizzleHandle {
  select(id: number): Promise<unknown>;
  execute(id: number): Promise<unknown>;
}

interface Variant {
  name: string;
  /** Absent for a variant measured on the concurrent cases only. */
  session?: Session;
  /** One query on the variant's single connection, for the burst on one connection. */
  oneConnection(n: number): Promise<unknown>;
  /** One query through a pool of ten connections. */
  pooled?(n: number): Promise<unknown>;
  drizzle?: DrizzleHandle;
  end(): Promise<void>;
}

const ITEM_QUERY = 'SELECT id, name, created_at FROM bench_item WHERE id = $1';

function twoRows(i: number): string[] {
  return [`${i}\ta\n`, `${i}\tb\n`];
}

async function countBytes(stream: AsyncIterable<Buffer>): Promise<number> {
  let bytes = 0;
  for await (const chunk of stream) bytes += chunk.length;
  return bytes;
}

/**
 * A connected socket with Nagle's algorithm off, which postgres.js then uses as it is. It stands in
 * for the patch that sets the same option inside postgres.js.
 */
function noDelaySocket({ host, port }: { host: string[]; port: number[] }): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: host[0] ?? 'localhost', port: port[0] ?? 5432 });
    socket.setNoDelay(true);
    socket.once('connect', () => resolve(socket));
    socket.once('error', reject);
  });
}

function postgresJsOptions(max: number, noDelay: boolean): postgres.Options<Record<string, never>> {
  return {
    host: connection.host,
    port: connection.port,
    database: connection.database,
    username: connection.user,
    password: connection.password,
    max,
    onnotice: () => {},
    // postgres.js's types leave out the socket option, which its connection code reads.
    ...(noDelay ? ({ socket: noDelaySocket } as object) : {}),
  };
}

function postgresJsSession(sql: postgres.Sql): Session {
  return {
    selectOne: () => sql`SELECT 1`,
    selectItem: (id) => sql`SELECT id, name, created_at FROM bench_item WHERE id = ${id}`,
    selectValue: (n) => sql`SELECT ${n}::int AS n`,
    async shortTransaction(id) {
      await sql.begin(async (tx) => {
        await tx`SELECT n FROM bench_counter WHERE id = ${id} FOR UPDATE`;
        await tx`UPDATE bench_counter SET n = n + 1 WHERE id = ${id}`;
        await tx`INSERT INTO bench_log (counter_id) VALUES (${id})`;
      });
    },
    async smallCopies(count) {
      const times: number[] = [];
      await sql.begin(async (tx) => {
        for (let i = 0; i < count; i++) {
          const started = performance.now();
          const writable = await tx`COPY bench_small FROM STDIN`.writable();
          await pipeline(Readable.from(twoRows(i)), writable);
          times.push(performance.now() - started);
        }
      });
      return times;
    },
    async copyIn(chunks) {
      const writable =
        await sql`COPY bench_observation_load FROM STDIN WITH (FORMAT csv, HEADER true)`.writable();
      await pipeline(Readable.from(chunks), writable);
    },
    async copyOut() {
      return countBytes(await sql`COPY bench_observation TO STDOUT`.readable());
    },
    async readRows(limit) {
      return (await sql`SELECT * FROM bench_observation LIMIT ${limit}`).length;
    },
  };
}

function postgresJsVariant(name: string, noDelay: boolean): Variant {
  const single = postgres(postgresJsOptions(1, noDelay));
  const pool = postgres(postgresJsOptions(10, noDelay));
  // A client of its own, because drizzle changes how the client it wraps parses dates.
  const drizzleClient = postgres(postgresJsOptions(1, noDelay));
  const db = drizzlePostgresJs(drizzleClient);
  return {
    name,
    session: postgresJsSession(single),
    oneConnection: (n) => single`SELECT ${n}::int AS n`,
    pooled: (n) => pool`SELECT ${n}::int AS n`,
    drizzle: {
      select: (id) => db.select().from(benchItem).where(eq(benchItem.id, id)),
      execute: (id) =>
        db.execute(drizzleSql`SELECT id, name, created_at FROM bench_item WHERE id = ${id}`),
    },
    async end() {
      await Promise.all([single.end(), pool.end(), drizzleClient.end()]);
    },
  };
}

function pgSession(client: pg.Client): Session {
  async function inTransaction(work: () => Promise<void>): Promise<void> {
    await client.query('BEGIN');
    try {
      await work();
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  return {
    selectOne: () => client.query('SELECT 1'),
    selectItem: (id) => client.query(ITEM_QUERY, [id]),
    selectValue: (n) => client.query('SELECT $1::int AS n', [n]),
    shortTransaction: (id) =>
      inTransaction(async () => {
        await client.query('SELECT n FROM bench_counter WHERE id = $1 FOR UPDATE', [id]);
        await client.query('UPDATE bench_counter SET n = n + 1 WHERE id = $1', [id]);
        await client.query('INSERT INTO bench_log (counter_id) VALUES ($1)', [id]);
      }),
    async smallCopies(count) {
      const times: number[] = [];
      await inTransaction(async () => {
        for (let i = 0; i < count; i++) {
          const started = performance.now();
          await pipeline(
            Readable.from(twoRows(i)),
            client.query(copyFrom('COPY bench_small FROM STDIN')),
          );
          times.push(performance.now() - started);
        }
      });
      return times;
    },
    async copyIn(chunks) {
      await pipeline(
        Readable.from(chunks),
        client.query(
          copyFrom('COPY bench_observation_load FROM STDIN WITH (FORMAT csv, HEADER true)'),
        ),
      );
    },
    copyOut: () => countBytes(client.query(copyTo('COPY bench_observation TO STDOUT'))),
    async readRows(limit) {
      return (await client.query('SELECT * FROM bench_observation LIMIT $1', [limit])).rows.length;
    },
  };
}

function reportErrors(
  emitter: { on(event: 'error', listener: (error: Error) => void): unknown },
  name: string,
): void {
  emitter.on('error', (error: Error) => console.error(`${name}: ${error.message}`));
}

async function pgVariant(): Promise<Variant> {
  const single = new pg.Client(connection);
  const pool = new pg.Pool({ ...connection, max: 10 });
  const drizzleClient = new pg.Client(connection);
  reportErrors(single, 'pg');
  reportErrors(pool, 'pg pool');
  reportErrors(drizzleClient, 'pg drizzle');
  await Promise.all([single.connect(), drizzleClient.connect()]);
  const db = drizzleNodePg(drizzleClient);
  return {
    name: 'pg',
    session: pgSession(single),
    oneConnection: (n) => single.query('SELECT $1::int AS n', [n]),
    pooled: (n) => pool.query('SELECT $1::int AS n', [n]),
    drizzle: {
      select: (id) => db.select().from(benchItem).where(eq(benchItem.id, id)),
      execute: (id) =>
        db.execute(drizzleSql`SELECT id, name, created_at FROM bench_item WHERE id = ${id}`),
    },
    async end() {
      await Promise.all([single.end(), pool.end(), drizzleClient.end()]);
    },
  };
}

/**
 * pg sends queries on one client back to back without waiting only in pipeline mode, which
 * refuses COPY. A pool hands each query a client of its own, so pipelining never applies there.
 */
async function pgPipelineVariant(): Promise<Variant> {
  const client = new pg.Client({ ...connection, pipeline: true });
  reportErrors(client, 'pg pipeline');
  await client.connect();
  return {
    name: 'pg, pipeline mode',
    oneConnection: (n) => client.query('SELECT $1::int AS n', [n]),
    end: () => client.end(),
  };
}

function itemId(round: number, i: number): number {
  return ((round * 97 + i * 31) % ITEMS) + 1;
}

async function timedEach(count: number, run: (i: number) => Promise<unknown>): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const started = performance.now();
    await run(i);
    times.push(performance.now() - started);
  }
  return times;
}

async function timedOnce(run: () => Promise<unknown>): Promise<number[]> {
  const started = performance.now();
  await run();
  return [performance.now() - started];
}

async function burst(run: (n: number) => Promise<unknown>): Promise<number[]> {
  return timedOnce(() => Promise.all(Array.from({ length: CONCURRENT_QUERIES }, (_, n) => run(n))));
}

function columnType(name: string): string {
  if (name === 'created_by') return 'text';
  if (name === 'created_at') return 'timestamptz';
  if (name === 'id' || name.endsWith('_id')) return 'uuid';
  if (name.endsWith('_date')) return 'date';
  return 'double precision';
}

function quoted(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Creates the benchmark's tables and loads the observation seed into the one the reads use. */
async function prepareTables(admin: pg.Client, seed: Buffer): Promise<number> {
  const header = seed.subarray(0, seed.indexOf('\n')).toString('utf8').trim().split(',');
  const columns = header.map((name) => `${quoted(name)} ${columnType(name)}`).join(', ');
  await admin.query(`
    DROP TABLE IF EXISTS bench_item, bench_counter, bench_log, bench_small, bench_observation,
      bench_observation_load;
    CREATE TABLE bench_item (id integer PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL);
    INSERT INTO bench_item
      SELECT g, 'item ' || g, now() - g * interval '1 minute' FROM generate_series(1, ${ITEMS}) g;
    CREATE TABLE bench_counter (id integer PRIMARY KEY, n integer NOT NULL);
    INSERT INTO bench_counter SELECT g, 0 FROM generate_series(1, ${COUNTERS}) g;
    CREATE TABLE bench_log (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      counter_id integer NOT NULL,
      at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNLOGGED TABLE bench_small (id integer, v text);
    CREATE UNLOGGED TABLE bench_observation (${columns});
    CREATE UNLOGGED TABLE bench_observation_load (LIKE bench_observation);
  `);
  await pipeline(
    Readable.from(chunked(seed)),
    admin.query(copyFrom('COPY bench_observation FROM STDIN WITH (FORMAT csv, HEADER true)')),
  );
  await admin.query('VACUUM ANALYZE bench_item, bench_counter, bench_observation');
  const { rows } = await admin.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM bench_observation',
  );
  return rows[0]?.count ?? 0;
}

function chunked(buffer: Buffer): Buffer[] {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += COPY_CHUNK_BYTES) {
    chunks.push(buffer.subarray(offset, offset + COPY_CHUNK_BYTES));
  }
  return chunks;
}

interface Case {
  name: string;
  applies(variant: Variant): boolean;
  /** Samples in milliseconds for one round, keyed by the name each is reported under. */
  round(variant: Variant, round: number): Promise<Record<string, number[]>>;
}

function buildCases(admin: pg.Client, seedChunks: Buffer[], seedRows: number): Case[] {
  const hasSession = (variant: Variant) => variant.session !== undefined;
  const session = (variant: Variant) => variant.session as Session;
  const sizeMb = (seedChunks.reduce((sum, chunk) => sum + chunk.length, 0) / 1e6).toFixed(0);
  return [
    {
      name: 'SELECT 1, one at a time',
      applies: hasSession,
      round: async (variant) => ({
        'SELECT 1, one at a time': await timedEach(SEQUENTIAL_QUERIES, () =>
          session(variant).selectOne(),
        ),
      }),
    },
    {
      name: 'Primary-key select, one at a time',
      applies: hasSession,
      round: async (variant, round) => ({
        'Primary-key select, one at a time': await timedEach(SEQUENTIAL_QUERIES, (i) =>
          session(variant).selectItem(itemId(round, i)),
        ),
      }),
    },
    {
      name: `${CONCURRENT_QUERIES} concurrent queries on one connection`,
      applies: () => true,
      round: async (variant) => ({
        [`${CONCURRENT_QUERIES} concurrent queries on one connection`]: await burst(
          variant.oneConnection,
        ),
      }),
    },
    {
      name: `${CONCURRENT_QUERIES} concurrent queries on a pool of 10`,
      applies: (variant) => variant.pooled !== undefined,
      round: async (variant) => ({
        [`${CONCURRENT_QUERIES} concurrent queries on a pool of 10`]: await burst((n) =>
          (variant.pooled as (n: number) => Promise<unknown>)(n),
        ),
      }),
    },
    {
      name: `Two-row COPY, ${SMALL_COPIES} in one transaction`,
      applies: hasSession,
      round: async (variant) => {
        const started = performance.now();
        const each = await session(variant).smallCopies(SMALL_COPIES);
        return {
          [`Two-row COPY, each of ${SMALL_COPIES} in one transaction`]: each,
          [`Two-row COPY, the whole transaction of ${SMALL_COPIES}`]: [performance.now() - started],
        };
      },
    },
    {
      name: 'Large COPY FROM',
      applies: hasSession,
      async round(variant) {
        await admin.query('TRUNCATE bench_observation_load');
        const samples = await timedOnce(() => session(variant).copyIn(seedChunks));
        const { rows } = await admin.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM bench_observation_load',
        );
        if (rows[0]?.count !== seedRows) {
          throw new Error(`${variant.name} copied ${rows[0]?.count} rows, expected ${seedRows}`);
        }
        return {
          [`COPY FROM, ${seedRows.toLocaleString('en-GB')} rows (${sizeMb} MB of CSV)`]: samples,
        };
      },
    },
    {
      name: 'Large COPY TO',
      applies: hasSession,
      async round(variant) {
        let bytes = 0;
        const samples = await timedOnce(async () => {
          bytes = await session(variant).copyOut();
        });
        if (bytes === 0) throw new Error(`${variant.name} read nothing from COPY TO`);
        return { [`COPY TO, ${seedRows.toLocaleString('en-GB')} rows`]: samples };
      },
    },
    {
      name: 'Large result',
      applies: hasSession,
      async round(variant) {
        let rows = 0;
        const samples = await timedOnce(async () => {
          rows = await session(variant).readRows(ROWS_READ);
        });
        if (rows !== ROWS_READ) throw new Error(`${variant.name} read ${rows} rows`);
        return { [`SELECT of ${ROWS_READ.toLocaleString('en-GB')} observation rows`]: samples };
      },
    },
    {
      name: 'Drizzle',
      applies: (variant) => variant.drizzle !== undefined,
      async round(variant, round) {
        const db = variant.drizzle as DrizzleHandle;
        return {
          'Drizzle select by primary key, one at a time': await timedEach(SEQUENTIAL_QUERIES, (i) =>
            db.select(itemId(round, i)),
          ),
          'Drizzle execute by primary key, one at a time': await timedEach(
            SEQUENTIAL_QUERIES,
            (i) => db.execute(itemId(round, i)),
          ),
        };
      },
    },
    {
      name: 'Short transaction',
      applies: hasSession,
      round: async (variant, round) => ({
        'Transaction of three statements, one at a time': await timedEach(TRANSACTIONS, (i) =>
          session(variant).shortTransaction(((round * TRANSACTIONS + i) % COUNTERS) + 1),
        ),
      }),
    },
  ];
}

async function main(): Promise<void> {
  const admin = new pg.Client(connection);
  reportErrors(admin, 'admin');
  await admin.connect();
  const seed = gunzipSync(readFileSync(seedFile));
  const seedRows = await prepareTables(admin, seed);
  const seedChunks = chunked(seed);
  const { rows: version } = await admin.query<{ server_version: string }>('SHOW server_version');

  const variants: Variant[] = [
    postgresJsVariant('postgres.js as installed', false),
    postgresJsVariant('postgres.js, no-delay socket', true),
    await pgVariant(),
    await pgPipelineVariant(),
  ];
  const cases = buildCases(admin, seedChunks, seedRows);
  const kept = new Map<string, Map<string, number[]>>();

  try {
    for (let round = 0; round < WARM_UP + ROUNDS; round++) {
      const started = performance.now();
      for (const benchCase of cases) {
        const applicable = variants.filter((variant) => benchCase.applies(variant));
        for (const variant of roundOrder(applicable, round)) {
          const samples = await benchCase.round(variant, round);
          if (round < WARM_UP) continue;
          for (const [name, values] of Object.entries(samples)) {
            const byVariant = kept.get(name) ?? new Map<string, number[]>();
            byVariant.set(variant.name, [...(byVariant.get(variant.name) ?? []), ...values]);
            kept.set(name, byVariant);
          }
        }
      }
      const label =
        round < WARM_UP
          ? `warm-up ${round + 1}/${WARM_UP}`
          : `round ${round - WARM_UP + 1}/${ROUNDS}`;
      console.log(`${label} took ${((performance.now() - started) / 1000).toFixed(1)} s`);
    }
  } finally {
    await Promise.all(variants.map((variant) => variant.end()));
    await admin.end();
  }

  const variantOrder = variants.map((variant) => variant.name);
  const measurements: Measurement[] = [...kept].flatMap(([name, byVariant]) =>
    variantOrder
      .filter((variant) => byVariant.has(variant))
      .map((variant) => ({ case: name, variant, samples: byVariant.get(variant) as number[] })),
  );
  const environment = {
    node: process.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpus: `${os.cpus().length} × ${os.cpus()[0]?.model ?? 'unknown'}`,
    memoryGb: Number((os.totalmem() / 1e9).toFixed(1)),
    postgres: version[0]?.server_version ?? 'unknown',
    database: `${connection.host}:${connection.port}`,
    commit: process.env.GITHUB_SHA ?? null,
    run: process.env.GITHUB_RUN_ID ?? null,
  };
  const report = {
    environment,
    settings: { rounds: ROUNDS, warmUp: WARM_UP, seedRows, rowsRead: ROWS_READ },
    results: measurements.map((measurement) => ({
      ...measurement,
      ...summarise(measurement.samples),
    })),
  };
  await writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`);

  const summary = [
    '## Postgres driver benchmark',
    '',
    `${ROUNDS} rounds after ${WARM_UP} warm-up rounds. Node ${environment.node}, ${environment.cpus}, Postgres ${environment.postgres} at ${environment.database}.`,
    '',
    markdownTable(measurements),
    '',
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}

await main();
