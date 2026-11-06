import { z } from 'zod';

/**
 * No default here — each schema attaches its own via `.default(n)` so the fallback lives
 * next to the app that owns it.
 */
export const portSchema = z.coerce.number().int().min(1).max(65_535);

/**
 * Not `z.coerce.boolean()`, which would turn the string 'false' into true — never what an
 * env var means.
 */
export const boolSchema = z.enum(['true', '1', 'false', '0']).transform((value) => {
  return value === 'true' || value === '1';
});

/**
 * `local` is a developer machine and `test` a test run or CI job; both mean everything
 * involved is on this machine, reached over http, with no certificate anywhere in the
 * picture. The rest are deployed.
 */
export const appEnvSchema = z.enum(['local', 'test', 'dev', 'preview', 'production']);

export type AppEnv = z.infer<typeof appEnvSchema>;

/**
 * The one predicate behind every fallback that differs between a machine here and a
 * deployed service — database TLS and secure session cookies today. Kept as a function
 * rather than repeated `!== 'local'` checks so adding an environment cannot leave one of
 * them behind.
 */
export function isDeployedEnv(appEnv: AppEnv): boolean {
  return appEnv !== 'local' && appEnv !== 'test';
}

// 'dev' is deployed but is populated by running the seed against it, while 'preview' and
// 'production' hold data no command may erase. 'test' is listed for the integration harness and
// e2e, which run under it: e2e completes its drafts with the sample answers.
export const DEV_CLASS_APP_ENVS: readonly AppEnv[] = ['local', 'test', 'dev'];

/**
 * Whether the environment's data is disposable, so seeding, resets and development aids such as
 * sample answers may run there. Fails closed: an unset or unknown value is not one.
 */
export function isDevClassEnv(appEnv: string | undefined): boolean {
  return DEV_CLASS_APP_ENVS.some((value) => value === appEnv);
}

/**
 * No default, deliberately. Every fallback keyed off APP_ENV is safe when deployed and
 * relaxed when not, so a default would have to be `local` — and an unset variable would
 * then silently pick the one value that turns TLS and secure cookies off. Every runtime
 * sets it: `.env.example` for development, compose for the containers, the test scripts
 * and CI for test runs, and the platform for deployed services.
 */
export const appEnvFields = { APP_ENV: appEnvSchema };

/**
 * One definition so the var names and accepted values can't drift between apps; only the
 * port default is per-app, hence the parameter.
 */
export function serverEnvFields(defaults: { port: number }) {
  return {
    ...appEnvFields,
    HOST: z.string().default('0.0.0.0'),
    PORT: portSchema.default(defaults.port),
    SHUTDOWN_DRAIN_MS: z.coerce.number().int().min(0).optional(),
    // Unlike the drain, this carries a default here: it is a ceiling rather than a wait, so a
    // stop with nothing in flight ends as soon as the drain does and a developer machine needs
    // no different value. The floor is what a stop needs to have phases at all.
    SHUTDOWN_GRACE_PERIOD_MS: z.coerce.number().int().min(1_000).default(25_000),
    // The commit an image was built from, set by docker/Dockerfile and logged on start-up.
    REVISION: z.string().default('unknown'),
  };
}

/**
 * The two shutdown numbers together, so the one thing they must satisfy is checked once. The
 * drain has no default in the field above because this fallback depends on APP_ENV, which a
 * shared fragment cannot see: nothing routes to a machine here, so a delay would only make
 * Ctrl-C slow. Deployed, the 5s gives the platform time to stop routing new requests here before
 * the server closes.
 *
 * The drain comes out of the grace period rather than adding to it, so one that fills the
 * budget leaves nothing to finish in-flight work in — a misconfiguration worth a startup
 * failure rather than a stop that resets every live request.
 */
export function resolveShutdown(
  appEnv: AppEnv,
  env: { SHUTDOWN_DRAIN_MS?: number | undefined; SHUTDOWN_GRACE_PERIOD_MS: number },
) {
  const drainDelayMs = env.SHUTDOWN_DRAIN_MS ?? (isDeployedEnv(appEnv) ? 5_000 : 0);
  const gracePeriodMs = env.SHUTDOWN_GRACE_PERIOD_MS;

  if (drainDelayMs >= gracePeriodMs) {
    throw new Error(
      `Invalid environment configuration:\nSHUTDOWN_DRAIN_MS (${drainDelayMs}) must be under ` +
        `SHUTDOWN_GRACE_PERIOD_MS (${gracePeriodMs}), the budget for the whole stop\n` +
        '(see .env.example)',
    );
  }

  return { drainDelayMs, gracePeriodMs } as const;
}

/**
 * The level names mirror pino's, kept as a plain enum so this package carries no pino
 * dependency. None of the fields has a default here: level and pretty depend on APP_ENV,
 * which a shared fragment cannot see, so `resolveLog` derives them all.
 */
export const logEnvFields = {
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
  LOG_PRETTY: boolSchema.optional(),
  LOG_REQUEST_DETAILS: boolSchema.optional(),
};

/**
 * Production and preview log at `info`; every other environment at `debug`, so the lines
 * beneath each action show wherever a developer is looking. Pretty output only under `local`;
 * every other runtime wants JSON. Pretty output prints each request as one summary line
 * unless LOG_REQUEST_DETAILS asks for its full `req` and `res`; JSON always carries them.
 */
export function resolveLog(
  appEnv: AppEnv,
  env: {
    LOG_LEVEL?: z.infer<typeof logEnvFields.LOG_LEVEL>;
    LOG_PRETTY?: boolean | undefined;
    LOG_REQUEST_DETAILS?: boolean | undefined;
  },
) {
  const productionLike = appEnv === 'production' || appEnv === 'preview';
  const pretty = appEnv === 'local' && (env.LOG_PRETTY ?? true);

  return {
    level: env.LOG_LEVEL ?? (productionLike ? 'info' : 'debug'),
    pretty,
    requestDetails: pretty && (env.LOG_REQUEST_DETAILS ?? false),
  } as const;
}

const nodeEnvSchema = z.enum(['development', 'production', 'test']).default('production');

/**
 * Blank values are dropped before parsing so `PORT=` behaves the same as an unset PORT —
 * zod defaults only apply to `undefined`, and an empty string would otherwise coerce to 0
 * or fail a `min(1)` check with a confusing message.
 *
 * On failure, throws a single error listing every invalid or missing variable, so a
 * misconfigured deployment reports all its problems in one startup crash.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  env: Record<string, string | undefined>,
): z.output<T> {
  const populated = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );

  const result = schema.safeParse(populated);

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}\n(see .env.example)`,
    );
  }

  return result.data;
}

/**
 * Trailing slash stripped so callers can always build request URLs as
 * `${apiUrl}/api/...` without risking a doubled slash.
 */
const apiUrlSchema = z.url().transform((value) => value.replace(/\/+$/, ''));

function webServerFields(defaults: { apiUrl: string; port: number }) {
  return {
    ...serverEnvFields(defaults),
    ...logEnvFields,
    API_URL: apiUrlSchema.default(defaults.apiUrl),
    // How long the web app waits for the API to answer an upload once it has been sent.
    API_UPLOAD_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
    NODE_ENV: nodeEnvSchema,
    // Proxies between the client and the app, whose X-Forwarded-* headers are trusted:
    // Front Door then Container Apps ingress today. 0 trusts none.
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).default(2),
    // RFC 7617 splits the credentials at the first colon, so a username cannot contain one.
    BASIC_AUTH_USERNAME: z
      .string()
      .regex(/^[^:]*$/, 'must not contain a colon')
      .optional(),
    BASIC_AUTH_PASSWORD: z.string().optional(),
  };
}

/** The secrets of a web app people sign in to. */
const signInFields = {
  SESSION_JWT_SECRET: z.string().min(32),
  // Signs the web app's own cookie session; rotates independently of the JWT secret.
  WEB_SESSION_SECRET: z.string().min(32),
};

const inviteeSchema = z.object({
  // Compared as typed into the private beta form, which is lower-cased and trimmed the same way.
  email: z.string().trim().toLowerCase().pipe(z.email()),
  label: z.string().trim().min(1),
});

export type BetaInvitee = z.output<typeof inviteeSchema>;

const inviteesSchema = z
  .string()
  .transform((value, context) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      context.addIssue({ code: 'custom', message: 'must be a JSON array' });
      return z.NEVER;
    }
  })
  .pipe(z.array(inviteeSchema).min(1));

/** public-web's private beta: only invitees, signed in by an emailed link, may use the site. */
const betaAccessFields = {
  BETA_ACCESS_INVITEES: inviteesSchema.optional(),
  BETA_ACCESS_ENDS_AT: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value))
    .optional(),
  BETA_ACCESS_SECRET: z.string().min(32).optional(),
  // The address people reach the site at. Sign-in links are built from it, never from the
  // request's Host header, which a client can set.
  SITE_URL: z
    .url()
    .transform((value) => value.replace(/\/+$/, ''))
    .optional(),
  EMAIL_ENDPOINT: z.url().optional(),
  EMAIL_SENDER_ADDRESS: z.email().optional(),
  AZURE_CLIENT_ID: z.string().optional(),
};

type BetaAccessEnv = z.output<z.ZodObject<typeof betaAccessFields>> & {
  APP_ENV: AppEnv;
  BASIC_AUTH_USERNAME?: string | undefined;
};

function checkBetaAccess(value: BetaAccessEnv, context: z.RefinementCtx): void {
  const issue = (path: string, message: string) =>
    context.addIssue({ code: 'custom', path: [path], message });

  if ((value.EMAIL_ENDPOINT === undefined) !== (value.EMAIL_SENDER_ADDRESS === undefined)) {
    issue('EMAIL_SENDER_ADDRESS', 'EMAIL_ENDPOINT and EMAIL_SENDER_ADDRESS must be set together');
  }
  if (value.BETA_ACCESS_INVITEES === undefined) return;

  for (const name of ['BETA_ACCESS_ENDS_AT', 'BETA_ACCESS_SECRET', 'SITE_URL'] as const) {
    if (value[name] === undefined) issue(name, `${name} is required with BETA_ACCESS_INVITEES`);
  }
  if (value.BASIC_AUTH_USERNAME !== undefined) {
    issue('BETA_ACCESS_INVITEES', 'private beta access and basic auth cannot both be on');
  }
  if (isDeployedEnv(value.APP_ENV) && value.EMAIL_ENDPOINT === undefined) {
    issue(
      'EMAIL_ENDPOINT',
      'EMAIL_ENDPOINT is required outside local and test, which show sign-in links on the page instead',
    );
  }
}

function betaAccessConfig(parsed: BetaAccessEnv) {
  const {
    BETA_ACCESS_INVITEES: invitees,
    BETA_ACCESS_ENDS_AT: endsAt,
    BETA_ACCESS_SECRET: secret,
    SITE_URL: siteUrl,
  } = parsed;
  // checkBetaAccess has already rejected invitees without the rest.
  if (
    invitees === undefined ||
    endsAt === undefined ||
    secret === undefined ||
    siteUrl === undefined
  ) {
    return undefined;
  }

  return {
    invitees,
    endsAt,
    secret,
    siteUrl,
    secure: isDeployedEnv(parsed.APP_ENV),
    // Without it, local and test show each sign-in link on the page rather than emailing it.
    email:
      parsed.EMAIL_ENDPOINT === undefined || parsed.EMAIL_SENDER_ADDRESS === undefined
        ? undefined
        : {
            endpoint: parsed.EMAIL_ENDPOINT,
            senderAddress: parsed.EMAIL_SENDER_ADDRESS,
            azureClientId: parsed.AZURE_CLIENT_ID,
          },
  } as const;
}

export type BetaAccessConfig = NonNullable<ReturnType<typeof betaAccessConfig>>;

function basicAuthSetTogether(value: {
  BASIC_AUTH_USERNAME?: string | undefined;
  BASIC_AUTH_PASSWORD?: string | undefined;
}): boolean {
  return (value.BASIC_AUTH_USERNAME === undefined) === (value.BASIC_AUTH_PASSWORD === undefined);
}

const basicAuthPairError = {
  message: 'BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD must be set together',
  path: ['BASIC_AUTH_PASSWORD'],
};

function webServerConfig(parsed: z.output<z.ZodObject<ReturnType<typeof webServerFields>>>) {
  return {
    offersDevTools: isDevClassEnv(parsed.APP_ENV),
    development: parsed.NODE_ENV === 'development',
    host: parsed.HOST,
    port: parsed.PORT,
    revision: parsed.REVISION,
    apiUrl: parsed.API_URL,
    apiUploadTimeoutMs: parsed.API_UPLOAD_TIMEOUT_MS,
    trustedProxyHops: parsed.TRUSTED_PROXY_HOPS,
    shutdown: resolveShutdown(parsed.APP_ENV, parsed),
    log: resolveLog(parsed.APP_ENV, parsed),
    basicAuth:
      parsed.BASIC_AUTH_USERNAME === undefined || parsed.BASIC_AUTH_PASSWORD === undefined
        ? undefined
        : { username: parsed.BASIC_AUTH_USERNAME, password: parsed.BASIC_AUTH_PASSWORD },
  } as const;
}

/** A web app nobody signs in to, such as public-web: it takes no session secret. */
export function loadWebServerConfig(
  env: NodeJS.ProcessEnv,
  defaults: { apiUrl: string; port: number },
) {
  const parsed = parseEnv(
    z
      .object({ ...webServerFields(defaults), ...betaAccessFields })
      .refine(basicAuthSetTogether, basicAuthPairError)
      .superRefine(checkBetaAccess),
    env,
  );

  return { ...webServerConfig(parsed), betaAccess: betaAccessConfig(parsed) } as const;
}

/** A web app people sign in to, such as internal-web: it signs their sessions. */
export function loadSignInWebServerConfig(
  env: NodeJS.ProcessEnv,
  defaults: { apiUrl: string; port: number },
) {
  const parsed = parseEnv(
    z
      .object({ ...webServerFields(defaults), ...signInFields })
      .refine(basicAuthSetTogether, basicAuthPairError),
    env,
  );
  const secure = isDeployedEnv(parsed.APP_ENV);

  return {
    ...webServerConfig(parsed),
    session: { secret: parsed.SESSION_JWT_SECRET, secure },
    webSession: { secret: parsed.WEB_SESSION_SECRET, secure },
  } as const;
}
