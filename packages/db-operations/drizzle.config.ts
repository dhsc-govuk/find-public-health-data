import { existsSync } from 'node:fs';

import { appEnvFields, parseEnv, z } from '@fphd/config';
import { dbEnvFields, resolveDbTls } from '@fphd/db';
import { defineConfig } from 'drizzle-kit';

// Load the repo-root .env when running drizzle-kit from this package
// (cwd = packages/db-operations). drizzle-kit connects as the owner login.
if (existsSync('../../.env')) {
  process.loadEnvFile('../../.env');
}

const env = parseEnv(
  z.object({
    ...dbEnvFields,
    ...appEnvFields,
    POSTGRES_USER: z.string().default('fphd'),
    POSTGRES_PASSWORD: z.string().default('fphd'),
  }),
  process.env,
);

export default defineConfig({
  dialect: 'postgresql',
  schema: '../db/src/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DB,
    ssl: resolveDbTls(env.APP_ENV, env.DB_TLS),
  },
});
