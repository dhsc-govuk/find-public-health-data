import { appEnvFields, isDeployedEnv, logEnvFields, parseEnv, resolveLog, z } from '@fphd/config';
import {
  checkDbLogin,
  type DbLoginSource,
  dbAuthEnvFields,
  dbEnvFields,
  resolveDbLogin,
  resolveDbTls,
} from '@fphd/db';

const envSchema = z
  .object({
    ...appEnvFields,
    ...logEnvFields,
    ...dbEnvFields,
    ...dbAuthEnvFields,
    // The owner role, not one of the per-API roles: every command here either creates those
    // roles, alters the schema they are granted on, or writes data they may only read.
    // Defaulted only locally — deployed, a missed injection must fail at startup rather than
    // reach the server as the dev superuser's name.
    POSTGRES_USER: z.string().min(1).optional(),
    POSTGRES_PASSWORD: z.string().min(1).optional(),
    // Only `db bootstrap` needs these, and it is one command of several. Required here they
    // would stop `db migrate` running in a job that has no business holding role passwords,
    // so the command that uses them asserts them instead.
    PUBLIC_API_PASSWORD: z.string().min(1).optional(),
    INTERNAL_API_PASSWORD: z.string().min(1).optional(),
    // Under DB_AUTH=entra, `db bootstrap` creates these Entra principals for the API identities.
    PUBLIC_API_DB_USER: z.string().min(1).optional(),
    PUBLIC_API_OBJECT_ID: z.guid().optional(),
    INTERNAL_API_DB_USER: z.string().min(1).optional(),
    INTERNAL_API_OBJECT_ID: z.guid().optional(),
    PUBLISHED_SNAPSHOT_URL: z.url().optional(),
    PUBLISHED_SNAPSHOT_SHA256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    DATA_MIGRATION_URL: z.url().optional(),
    DATA_MIGRATION_SHA256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .superRefine((env, ctx) => {
    checkDbLogin(dbLogin(env), ctx);
    if (isDeployedEnv(env.APP_ENV) && env.POSTGRES_USER === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['POSTGRES_USER'],
        message: `required when APP_ENV is '${env.APP_ENV}'`,
      });
    }
  });

/**
 * Every process.env read in this app happens via this module. Kept pure — the parse of the
 * real environment happens once, in config.ts.
 *
 * No HOST or PORT: this app is a set of jobs run to completion, never a listening server.
 */
export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = parseEnv(envSchema, env);

  return {
    appEnv: parsed.APP_ENV,
    log: resolveLog(parsed.APP_ENV, parsed),
    db: {
      host: parsed.DB_HOST,
      port: parsed.DB_PORT,
      database: parsed.POSTGRES_DB,
      ...resolveDbLogin(dbLogin(parsed)),
      ssl: resolveDbTls(parsed.APP_ENV, parsed.DB_TLS),
    },
    roles: {
      publicApiPassword: parsed.PUBLIC_API_PASSWORD,
      internalApiPassword: parsed.INTERNAL_API_PASSWORD,
      publicApiPrincipal: principal(parsed.PUBLIC_API_DB_USER, parsed.PUBLIC_API_OBJECT_ID),
      internalApiPrincipal: principal(parsed.INTERNAL_API_DB_USER, parsed.INTERNAL_API_OBJECT_ID),
    },
    publishedSnapshot: {
      url: parsed.PUBLISHED_SNAPSHOT_URL,
      sha256: parsed.PUBLISHED_SNAPSHOT_SHA256,
    },
    dataMigration: {
      url: parsed.DATA_MIGRATION_URL,
      sha256: parsed.DATA_MIGRATION_SHA256,
    },
  } as const;
}

/** Locally the owner defaults to the compose superuser. Under Entra it is the job's principal. */
function dbLogin(env: {
  DB_AUTH: 'password' | 'entra';
  AZURE_CLIENT_ID?: string | undefined;
  POSTGRES_USER?: string | undefined;
  POSTGRES_PASSWORD?: string | undefined;
}): DbLoginSource {
  return {
    auth: env.DB_AUTH,
    clientId: env.AZURE_CLIENT_ID,
    user: env.DB_AUTH === 'entra' ? env.POSTGRES_USER : (env.POSTGRES_USER ?? 'fphd'),
    userVariable: 'POSTGRES_USER',
    password: env.POSTGRES_PASSWORD,
    passwordVariable: 'POSTGRES_PASSWORD',
  };
}

function principal(
  name: string | undefined,
  objectId: string | undefined,
): { name: string; objectId: string } | undefined {
  return name === undefined || objectId === undefined ? undefined : { name, objectId };
}

export type Config = ReturnType<typeof loadConfig>;
