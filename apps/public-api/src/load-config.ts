import {
  logEnvFields,
  parseEnv,
  resolveLog,
  resolveShutdown,
  serverEnvFields,
  z,
} from '@fphd/config';
import { dbEnvFields, resolveDbTls } from '@fphd/db';

const envSchema = z.object({
  ...serverEnvFields({ port: 4000 }),
  ...logEnvFields,
  ...dbEnvFields,
  PUBLIC_API_PASSWORD: z.string().min(1),
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
    db: {
      host: parsed.DB_HOST,
      port: parsed.DB_PORT,
      database: parsed.POSTGRES_DB,
      user: 'public_api',
      password: parsed.PUBLIC_API_PASSWORD,
      ssl: resolveDbTls(parsed.APP_ENV, parsed.DB_TLS),
    },
  } as const;
}

export type Config = ReturnType<typeof loadConfig>;
