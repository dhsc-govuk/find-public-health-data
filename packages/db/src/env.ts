import { type AppEnv, boolSchema, isDeployedEnv, portSchema, z } from '@fphd/config';

import type { DbConnection } from './client.ts';

/**
 * Each app adds its own role password on top of these. Defaults match the local docker
 * compose database.
 */
export const dbEnvFields = {
  DB_HOST: z.string().default('localhost'),
  DB_PORT: portSchema.default(5432),
  DB_TLS: boolSchema.optional(),
  POSTGRES_DB: z.string().default('fphd'),
};

/**
 * Every managed Postgres this deploys to requires TLS, so it is on unless the database is
 * on this machine — the compose stack under `local`, the disposable test databases under
 * `test` — where nothing presents a certificate to verify. No default on the field itself:
 * like LOG_PRETTY, the fallback depends on APP_ENV, which a shared field fragment cannot
 * see.
 */
export function resolveDbTls(appEnv: AppEnv, dbTls: boolean | undefined): boolean {
  return dbTls ?? isDeployedEnv(appEnv);
}

/**
 * How an app signs in to Postgres. `password` locally and in CI; `entra` in the deployed
 * environments, with a token from the managed identity AZURE_CLIENT_ID.
 */
export const dbAuthEnvFields = {
  DB_AUTH: z.enum(['password', 'entra']).default('password'),
  AZURE_CLIENT_ID: z.guid().optional(),
};

export type DbLogin = Pick<DbConnection, 'user'> &
  ({ password: string } | { entraClientId: string });

export interface DbLoginSource {
  auth: 'password' | 'entra';
  clientId: string | undefined;
  user: string | undefined;
  userVariable: string;
  password: string | undefined;
  passwordVariable: string;
}

function missingDbLogin(source: DbLoginSource): string[] {
  const secret =
    source.auth === 'password'
      ? { name: source.passwordVariable, value: source.password }
      : { name: 'AZURE_CLIENT_ID', value: source.clientId };
  return [
    source.user === undefined ? source.userVariable : undefined,
    secret.value === undefined ? secret.name : undefined,
  ].filter((name) => name !== undefined);
}

/**
 * For an app schema's `superRefine`, so a missing login is reported with the schema's other
 * errors. Zod skips it when a value has the wrong type, so then it is reported on the next run.
 */
export function checkDbLogin(source: DbLoginSource, ctx: z.RefinementCtx): void {
  for (const variable of missingDbLogin(source)) {
    ctx.addIssue({
      code: 'custom',
      path: [variable],
      message: `required when DB_AUTH is '${source.auth}'`,
    });
  }
}

/** The user and secret to connect with. Throws if `checkDbLogin` would have reported anything. */
export function resolveDbLogin(source: DbLoginSource): DbLogin {
  const missing = missingDbLogin(source);
  if (missing.length > 0 || source.user === undefined) {
    throw new Error(`DB_AUTH=${source.auth} needs ${missing.join(' and ')}`);
  }
  return source.auth === 'password' && source.password !== undefined
    ? { user: source.user, password: source.password }
    : { user: source.user, entraClientId: source.clientId ?? '' };
}
