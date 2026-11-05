import {
  logEnvFields,
  parseEnv,
  resolveLog,
  resolveShutdown,
  serverEnvFields,
  z,
} from '@fphd/config';
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
    // The port serves only the probes.
    ...serverEnvFields({ port: 4002 }),
    ...logEnvFields,
    ...dbEnvFields,
    ...dbAuthEnvFields,
    INTERNAL_API_PASSWORD: z.string().min(1).optional(),
    // The worker identity's Entra principal, a member of internal_api.
    DB_USER: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => checkDbLogin(dbLogin(env), ctx));

function dbLogin(env: {
  DB_AUTH: 'password' | 'entra';
  AZURE_CLIENT_ID?: string | undefined;
  DB_USER?: string | undefined;
  INTERNAL_API_PASSWORD?: string | undefined;
}): DbLoginSource {
  return {
    auth: env.DB_AUTH,
    clientId: env.AZURE_CLIENT_ID,
    user: env.DB_AUTH === 'entra' ? env.DB_USER : 'internal_api',
    userVariable: 'DB_USER',
    password: env.INTERNAL_API_PASSWORD,
    passwordVariable: 'INTERNAL_API_PASSWORD',
  };
}

/** Every process.env read in this app happens via this module. The parse of the real environment
 * happens once, in config.ts. */
export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = parseEnv(envSchema, env);

  return {
    appEnv: parsed.APP_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    revision: parsed.REVISION,
    log: resolveLog(parsed.APP_ENV, parsed),
    shutdown: resolveShutdown(parsed.APP_ENV, parsed),
    db: {
      host: parsed.DB_HOST,
      port: parsed.DB_PORT,
      database: parsed.POSTGRES_DB,
      ...resolveDbLogin(dbLogin(parsed)),
      ssl: resolveDbTls(parsed.APP_ENV, parsed.DB_TLS),
    },
  } as const;
}

export type Config = ReturnType<typeof loadConfig>;
