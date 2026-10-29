import {
  type DestinationStream,
  type LogFn,
  type Logger,
  type LoggerOptions,
  pino,
  type SerializedError,
  stdSerializers,
} from 'pino';

export type { Logger };

export interface CreateLoggerOptions {
  /** Service name attached to every log line (e.g. 'public-api'). */
  name: string;
  /** Defaults to 'info'. Node apps pass this from their config. */
  level?: LoggerOptions['level'];
  pretty?: boolean;
  /** Pretty output only: print each request's `req` and `res` in full rather than one summary
   * line. JSON output always carries them. */
  requestDetails?: boolean;
  /** Where lines go; stdout by default. Pretty output is off when one is given. */
  destination?: DestinationStream;
}

/** `method url status time`, appended to the message of request lines only. */
const requestSummary =
  '{msg}{if req.method} {req.method} {req.url}{end}{if res.statusCode} {res.statusCode} {responseTime}ms{end}';

const prettyOptions = { colorize: true, translateTime: 'SYS:HH:MM:ss.l' };

/**
 * Local development only — the guards keep a stray pretty flag from resolving pino-pretty
 * where it is absent (a devDependency, not in production installs; never in the browser).
 */
function prettyTransport(
  pretty: boolean | undefined,
  requestDetails: boolean | undefined,
): LoggerOptions['transport'] {
  // `process` is undefined in the browser bundles used by the web apps.
  const isNodeRuntime = typeof process !== 'undefined' && process.versions?.node !== undefined;
  // biome-ignore lint/style/noProcessEnv: pino-pretty is absent from production installs
  if (!pretty || !isNodeRuntime || process.env.NODE_ENV === 'production') {
    return undefined;
  }

  return {
    target: 'pino-pretty',
    options: requestDetails
      ? { ...prettyOptions, ignore: 'pid,hostname' }
      : {
          ...prettyOptions,
          ignore: 'pid,hostname,req,res,responseTime',
          messageFormat: requestSummary,
        },
  };
}

/**
 * The single shared entry point for logging across all four apps — Node services and browser
 * bundles alike (pino resolves to its browser build under a bundler). This package never
 * reads app configuration itself: level and pretty flow in from each app.
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const loggerOptions: LoggerOptions = {
    name: options.name,
    level: options.level ?? 'info',
    serializers: { err: serializeError },
    hooks: {
      logMethod(args, method) {
        method.apply(this, withMessageScrubbed(args) as Parameters<LogFn>);
      },
    },
  };

  if (options.destination !== undefined) {
    return pino(loggerOptions, options.destination);
  }

  const transport = prettyTransport(options.pretty, options.requestDetails);
  if (transport !== undefined) {
    loggerOptions.transport = transport;
  }

  return pino(loggerOptions);
}

interface QueryError extends Error {
  query: string;
  params: unknown[];
}

/** Drizzle's error for a failed query; matched by shape, so the browser bundle needs no Drizzle. */
function isQueryError(value: unknown): value is QueryError {
  return (
    value instanceof Error &&
    'query' in value &&
    typeof value.query === 'string' &&
    'params' in value &&
    Array.isArray(value.params)
  );
}

// pino's own test for an error.
function isErrorLike(value: unknown): value is { message: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

/** The failed queries an error leads to through its cause, AggregateError errors and fields. */
function queryErrorsIn(error: unknown): QueryError[] {
  const found: QueryError[] = [];
  const seen = new Set<unknown>();
  const pending = [error];

  while (pending.length > 0) {
    const value = pending.pop();

    if (!isErrorLike(value) || seen.has(value)) continue;
    seen.add(value);

    if (isQueryError(value)) found.push(value);
    pending.push(
      'cause' in value ? value.cause : undefined,
      ...('errors' in value && Array.isArray(value.errors) ? value.errors : []),
      ...Object.values(value),
    );
  }

  return found;
}

// Longest first, so a message that is a prefix of another can't leave the other's tail behind.
function scrubberFor(queries: readonly QueryError[]): (text: string) => string {
  const messages = queries
    .map(({ message }) => message)
    .filter((message) => message !== '')
    .toSorted((a, b) => b.length - a.length);

  return (text) =>
    messages.reduce((scrubbed, message) => scrubbed.replaceAll(message, 'Failed query'), text);
}

function isSerializedError(value: unknown): value is SerializedError {
  return typeof value === 'object' && value !== null && 'raw' in value && isErrorLike(value.raw);
}

function scrubbed(
  serialized: SerializedError,
  scrub: (text: string) => string,
): Record<string, unknown> {
  const fromQuery = isQueryError(serialized.raw);
  const scrubValue = (value: unknown): unknown => {
    if (typeof value === 'string') return scrub(value);
    if (isSerializedError(value)) return scrubbed(value, scrub);
    // `aggregateErrors`
    if (Array.isArray(value))
      return value.map((item) => (isSerializedError(item) ? scrubbed(item, scrub) : item));
    return value;
  };

  return Object.fromEntries(
    Object.entries(serialized)
      .filter(([key]) => !(fromQuery && key === 'params'))
      .map(([key, value]) => [key, scrubValue(value)]),
  );
}

// pino-http hands a custom serializer pino's serialization of the error, whose `raw` is the error.
function unserialized(input: unknown): unknown {
  return isSerializedError(input) && !(input instanceof Error) ? input.raw : input;
}

/**
 * pino's error serializer, less a failed query's bound parameters: Drizzle puts them in the
 * message, the stack and a field, and for a write they are the request body. A failed query's
 * cause, the Postgres error, becomes a field, for its code, severity and routine.
 */
export function serializeError(input: unknown): unknown {
  const error = unserialized(input);
  const serialized = stdSerializers.err(error as Error);
  const queries = queryErrorsIn(error);

  if (queries.length === 0) return serialized;

  const scrub = scrubberFor(queries);
  const result = scrubbed(serialized, scrub);

  if (!isQueryError(error) || !isErrorLike(error.cause)) return result;

  // The cause's stack is already on the end of the query's.
  const cause = scrubbed(stdSerializers.err(error.cause as Error), scrub);
  return { ...result, cause: { ...cause, stack: undefined } };
}

/** A call's arguments, with the message pino would take from a failed query's error scrubbed. */
function withMessageScrubbed(args: readonly unknown[]): unknown[] {
  const [first, message, ...rest] = args;

  if (message !== undefined || typeof first !== 'object' || first === null) return [...args];

  // pino takes the message from the error only when the call and its object give none.
  const error =
    first instanceof Error
      ? first
      : 'msg' in first && first.msg !== undefined
        ? undefined
        : 'err' in first
          ? first.err
          : undefined;

  if (!isErrorLike(error)) return [...args];

  const queries = queryErrorsIn(error);

  return queries.length === 0 ? [...args] : [first, scrubberFor(queries)(error.message), ...rest];
}
