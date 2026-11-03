import {
  isDeployedEnv,
  logEnvFields,
  parseEnv,
  resolveLog,
  resolveShutdown,
  serverEnvFields,
  z,
} from '@fphd/config';
import { dbEnvFields, resolveDbTls } from '@fphd/db';
import { resolveStorage, storageEnvFields } from '@fphd/internal-storage';

const envSchema = z.object({
  ...serverEnvFields({ port: 4001 }),
  ...logEnvFields,
  ...dbEnvFields,
  ...storageEnvFields,
  INTERNAL_API_PASSWORD: z.string().min(1),
  SESSION_JWT_SECRET: z.string().min(32),
});

/**
 * Every process.env read in this app happens via this module; new config domains (auth,
 * notifications, …) add a schema fragment above and a section below. Kept pure — the parse
 * of the real environment happens once, in config.ts.
 */
export function loadConfig(env: NodeJS.ProcessEnv) {
  const parsed = parseEnv(envSchema, env);

  return {
    appEnv: parsed.APP_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    revision: parsed.REVISION,
    log: resolveLog(parsed.APP_ENV, parsed),
    shutdown: resolveShutdown(parsed.APP_ENV, parsed),
    session: {
      secret: parsed.SESSION_JWT_SECRET,
      secure: isDeployedEnv(parsed.APP_ENV),
    },
    db: {
      host: parsed.DB_HOST,
      port: parsed.DB_PORT,
      database: parsed.POSTGRES_DB,
      user: 'internal_api',
      password: parsed.INTERNAL_API_PASSWORD,
      ssl: resolveDbTls(parsed.APP_ENV, parsed.DB_TLS),
    },
    storage: resolveStorage(parsed.APP_ENV, parsed),
  } as const;
}

export type Config = ReturnType<typeof loadConfig>;
