import { readCookie } from '@fphd/auth/cookies';
import type { z } from '@fphd/config/zod';
import type { Logger } from '@fphd/logger';

export interface ApiClientOptions {
  baseUrl: string;
  /** Sent with every request — the internal app forwards its session cookie this way. */
  headers?: Record<string, string>;
  /** The page request's logger, from `loggerContext`, which gets a line for each call. */
  logger: Logger;
  /** Aborts when the browser leaves, abandoning every call still in flight. */
  signal: AbortSignal;
  /** Abort and fail rather than hold a page render open indefinitely. */
  timeoutMs?: number;
  /** As `timeoutMs`, for `postStream`'s answer once its body is sent; undefined takes the default. */
  uploadTimeoutMs?: number | undefined;
}

/** A request body passed on as it arrives, such as a browser's file upload. */
export interface StreamedBody {
  body: ReadableStream<Uint8Array> | null;
  /** The body's own content type, which for a multipart form names its boundary. */
  contentType: string;
}

/** A schema the client parses a response with, for callers that pass one along. */
export type ApiResponseSchema<T> = z.ZodType<T>;

export type ApiWriteResult<T, E> = { ok: true; data: T } | { ok: false; status: number; error: E };

export interface ApiClient {
  /**
   * GET `path`, parse the body with `schema`, and return the result. A 404 is rethrown as a
   * 404 `Response` so a route's not-found boundary renders, and a 409 as an `ApiConflictError`
   * for a caller that expects one; any other non-2xx becomes a 502, because a failure inside the
   * API is not the browser's fault.
   */
  get<T>(path: string, schema: z.ZodType<T>): Promise<T>;

  /**
   * PUT `body` to `path`. A 400 or 409 comes back as a value parsed with `errorSchema`, for a
   * form to render. A 404 throws for the not-found boundary; anything else, including a 401 or
   * 403 the route middleware should have refused first, is a 502.
   */
  put<T, E>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    errorSchema: z.ZodType<E>,
  ): Promise<ApiWriteResult<T, E>>;

  /** PATCH `body` to `path`, changing only the fields it carries. Answers as `put` does. */
  patch<T, E>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    errorSchema: z.ZodType<E>,
  ): Promise<ApiWriteResult<T, E>>;

  /** POST `body` to create. As `put`, minus the 404 case: the collection always exists. */
  post<T, E>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    errorSchema: z.ZodType<E>,
  ): Promise<ApiWriteResult<T, E>>;

  /**
   * POST `body` to a member of a collection, for an action that answers 204 with no body. A 400
   * or 409 comes back as a value parsed with `errorSchema`; otherwise as `put`.
   */
  postToMember<E>(
    path: string,
    body: unknown,
    errorSchema: z.ZodType<E>,
  ): Promise<ApiWriteResult<undefined, E>>;

  /**
   * POST a body to `path` as it arrives, without reading it first, then wait up to the upload
   * timeout for the answer, throwing `ApiTimeoutError` after it. A 400, 409 or 422 comes back as
   * a value parsed with `errorSchema`; otherwise as `put`.
   */
  postStream<T, E>(
    path: string,
    body: StreamedBody,
    schema: z.ZodType<T>,
    errorSchema: z.ZodType<E>,
  ): Promise<ApiWriteResult<T, E>>;

  /**
   * DELETE `path`. A 204 has no body; a 409 comes back as a value parsed with `errorSchema`; a
   * 404 throws for the not-found boundary, the rest 502.
   */
  delete<E>(path: string, errorSchema: z.ZodType<E>): Promise<ApiWriteResult<undefined, E>>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** The API took longer to answer an upload than the upload timeout allows. */
export class ApiTimeoutError extends Error {
  constructor(path: string) {
    super(`No answer from ${path} within the upload timeout`);
    this.name = 'ApiTimeoutError';
  }
}

/** The API refused a read as in conflict with the state of what it names; `body` is its answer. */
export class ApiConflictError extends Error {
  readonly body: unknown;

  constructor(path: string, body: unknown) {
    super(`${path} answered 409`);
    this.name = 'ApiConflictError';
    this.body = body;
  }
}

// Under Front Door's 60 seconds for an origin to answer, so the page's own message wins its 504.
const DEFAULT_UPLOAD_TIMEOUT_MS = 50_000;

/** A `Cookie` header carrying only the named cookie, so the API never sees the browser's others. */
export function forwardedCookieHeaders(
  cookieHeader: string | null | undefined,
  cookieName: string,
): Record<string, string> {
  const value = readCookie(cookieHeader, cookieName);

  return value === undefined ? {} : { cookie: `${cookieName}=${value}` };
}

/**
 * Path segments are encoded here so no caller can interpolate one raw. React Router decodes
 * `%2F` inside a single dynamic segment, so an un-encoded slug of `../internal` would
 * normalise the request onto a different API route entirely.
 *
 * An empty segment is rejected rather than tolerated: it silently changes which route the
 * path addresses — `/api/topics/` is the collection, not a member — and it does so wherever
 * it appears, not only at the end, so a trailing slash is not a signal a caller could check
 * for. The parameter type keeps this out of reach at compile time; the throw is for callers
 * whose types have been erased.
 */
export function apiPath(strings: TemplateStringsArray, ...segments: string[]) {
  return strings.reduce((path, literal, index) => {
    if (index === 0) {
      return literal;
    }

    const segment = segments[index - 1];
    if (segment === undefined || segment === '') {
      throw new Error(
        `apiPath: segment ${index} is empty, which would address a different route than intended`,
      );
    }

    return `${path}${encodeURIComponent(segment)}${literal}`;
  }, '');
}

/** Why a call failed, or `aborted` when the browser left before it finished. */
type ApiCallFailure =
  | 'aborted'
  | 'connection_failed'
  | 'not_json'
  | 'schema_mismatch'
  | 'timeout'
  | 'unexpected_status';

/** Where a response failed its schema. Never the issue's message, which can quote the value. */
interface SchemaIssue {
  path: PropertyKey[];
  code: string;
}

/** An answer this app can't use: the 502 to throw, and what to log about it. */
class UnusableAnswer {
  readonly failure: 'not_json' | 'schema_mismatch' | 'unexpected_status';
  readonly response: Response;
  readonly issues: SchemaIssue[] | undefined;

  constructor(failure: UnusableAnswer['failure'], response: Response, issues?: SchemaIssue[]) {
    this.failure = failure;
    this.response = response;
    this.issues = issues;
  }
}

function unexpectedStatus(): never {
  throw new UnusableAnswer('unexpected_status', new Response('Bad Gateway', { status: 502 }));
}

function unexpectedResponse(path: string) {
  return new Response(`Unexpected response from ${path}`, { status: 502 });
}

function notFound(): never {
  throw new Response('Not Found', { status: 404 });
}

/**
 * The API answered with a shape this app does not understand. Failing here keeps the mismatch
 * at the boundary instead of rendering undefined fields down the page.
 */
function parseOrFail<T>(path: string, schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new UnusableAnswer(
      'schema_mismatch',
      unexpectedResponse(path),
      result.error.issues.map(({ path, code }) => ({ path, code })),
    );
  }

  return result.data;
}

/**
 * A non-JSON body (an ingress error page, an empty 200) fails the same way as a shape mismatch.
 * The parse error isn't logged, because its message quotes the start of the body.
 */
async function readJson(path: string, response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new UnusableAnswer('not_json', unexpectedResponse(path));
  }
}

async function readParsed<T>(path: string, schema: z.ZodType<T>, response: Response) {
  return parseOrFail(path, schema, await readJson(path, response));
}

async function refusal<E>(path: string, errorSchema: z.ZodType<E>, response: Response) {
  return {
    ok: false as const,
    status: response.status,
    error: await readParsed(path, errorSchema, response),
  };
}

/**
 * The refusal a write to a member of a collection can get. The record may be gone, so a 404 is
 * meaningful. A 400 or 409 comes back parsed. Any other answer is left to the caller.
 */
async function memberRefusal<E>(path: string, errorSchema: z.ZodType<E>, response: Response) {
  if (response.status === 404) notFound();
  if (response.status === 400 || response.status === 409) {
    return refusal(path, errorSchema, response);
  }
  return undefined;
}

// `duplex` is required of a streamed body, and missing from the DOM library's RequestInit.
type CallInit = Omit<RequestInit, 'method' | 'signal'> & { duplex?: 'half' };

export function createApiClient({
  baseUrl,
  headers = {},
  logger,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  uploadTimeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
}: ApiClientOptions): ApiClient {
  const json = (body: unknown): CallInit => ({
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  /**
   * Every call goes through here, and logs one line once it settles. `answer` reads the
   * response, and throws an `UnusableAnswer` for one the page can't use.
   */
  async function call<R>(
    method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT',
    path: string,
    init: CallInit,
    answer: (response: Response) => Promise<R>,
    timeout: AbortSignal = AbortSignal.timeout(timeoutMs),
  ): Promise<R> {
    const started = performance.now();
    const combined = AbortSignal.any([timeout, signal]);
    let status: number | undefined;
    const fields = (failure?: ApiCallFailure, issues?: SchemaIssue[]) => ({
      method,
      path,
      ...(status === undefined ? {} : { status }),
      ms: Math.round(performance.now() - started),
      ...(failure === undefined ? {} : { failure }),
      ...(issues === undefined ? {} : { issues }),
    });

    try {
      const response = await fetch(`${baseUrl}${path}`, { ...init, method, signal: combined });
      status = response.status;
      const result = await answer(response);
      logger.debug({ api: fields() }, 'API call');
      return result;
    } catch (error) {
      const unusable = error instanceof UnusableAnswer ? error : undefined;
      const failure: ApiCallFailure | undefined = combined.aborted
        ? signal.aborted
          ? 'aborted'
          : 'timeout'
        : (unusable?.failure ?? (status === undefined ? 'connection_failed' : undefined));

      if (failure === undefined || failure === 'aborted') {
        logger.debug({ api: fields(failure) }, 'API call');
      } else {
        const api = fields(failure, unusable?.issues);
        logger.error(unusable === undefined ? { api, err: error } : { api }, 'API call failed');
      }

      throw unusable?.response ?? error;
    }
  }

  function writeToMember<T, E>(
    method: 'PATCH' | 'PUT',
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    errorSchema: z.ZodType<E>,
  ): Promise<ApiWriteResult<T, E>> {
    return call(method, path, json(body), async (response) => {
      const refused = await memberRefusal(path, errorSchema, response);
      if (refused !== undefined) return refused;
      if (!response.ok) unexpectedStatus();
      return { ok: true, data: await readParsed(path, schema, response) };
    });
  }

  return {
    get(path, schema) {
      return call('GET', path, { headers }, async (response) => {
        if (response.status === 404) notFound();
        if (response.status === 409) {
          throw new ApiConflictError(path, await readJson(path, response));
        }
        if (!response.ok) unexpectedStatus();
        return readParsed(path, schema, response);
      });
    },

    put(path, body, schema, errorSchema) {
      return writeToMember('PUT', path, body, schema, errorSchema);
    },

    patch(path, body, schema, errorSchema) {
      return writeToMember('PATCH', path, body, schema, errorSchema);
    },

    post(path, body, schema, errorSchema) {
      return call('POST', path, json(body), async (response) => {
        if (response.status === 400 || response.status === 409) {
          return refusal(path, errorSchema, response);
        }
        if (!response.ok) unexpectedStatus();
        return { ok: true, data: await readParsed(path, schema, response) };
      });
    },

    postToMember(path, body, errorSchema) {
      return call('POST', path, json(body), async (response) => {
        const refused = await memberRefusal(path, errorSchema, response);
        if (refused !== undefined) return refused;
        if (response.status !== 204) unexpectedStatus();
        return { ok: true, data: undefined };
      });
    },

    async postStream(path, { body, contentType }, schema, errorSchema) {
      // The timeout covers the API's answer, not the browser's upload, so it starts once the
      // body has been sent.
      const timeout = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const startTimer = () => {
        timer = setTimeout(() => timeout.abort(), uploadTimeoutMs);
      };
      const sent = body?.pipeThrough(new TransformStream({ flush: startTimer })) ?? null;
      if (sent === null) startTimer();

      const init: CallInit = {
        headers: { ...headers, 'content-type': contentType },
        body: sent,
        duplex: 'half',
      };

      try {
        return await call(
          'POST',
          path,
          init,
          async (response) => {
            if (response.status === 404) notFound();
            if (response.status === 400 || response.status === 409 || response.status === 422) {
              return refusal(path, errorSchema, response);
            }
            if (!response.ok) unexpectedStatus();
            return { ok: true, data: await readParsed(path, schema, response) };
          },
          timeout.signal,
        );
      } catch (error) {
        if (timeout.signal.aborted) throw new ApiTimeoutError(path);
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },

    delete(path, errorSchema) {
      return call('DELETE', path, { headers }, async (response) => {
        if (response.status === 404) notFound();
        if (response.status === 409) return refusal(path, errorSchema, response);
        if (!response.ok) unexpectedStatus();
        return { ok: true, data: undefined };
      });
    },
  };
}
