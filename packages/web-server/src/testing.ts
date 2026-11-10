import { z } from '@fphd/config/zod';

import type { ApiClient, ApiWriteResult } from './api-client.ts';

export type FakeApiMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

/** A call the fake API client received. A GET or a DELETE has no body. */
export interface FakeApiCall {
  method: FakeApiMethod;
  path: string;
  body?: unknown;
}

/** The API refused a write: the status, and the error body the caller's error schema parses. */
class Refusal {
  readonly status: number;
  readonly error: unknown;

  constructor(status: number, error: unknown) {
    this.status = status;
    this.error = error;
  }
}

/** The client threw instead of answering, as it does for a 404 or a timeout. */
class Failure {
  readonly error: unknown;

  constructor(error: unknown) {
    this.error = error;
  }
}

/** The API answered 204, with no body, as it does to a delete or an action on a member. */
class NoContent {}

/** A refusal of a write, with the status the API answers and its error body. */
export function refused(status: number, error: unknown): Refusal {
  return new Refusal(status, error);
}

/** The client throws `error`, such as a 404 `Response` or an `ApiConflictError`. */
export function fails(error: unknown): Failure {
  return new Failure(error);
}

/** The answer to a delete or an action on a member, which has no body. */
export const noContent = new NoContent();

/**
 * A stubbed answer. Anything other than `refused`, `fails` or `noContent` is a response body,
 * parsed with the schema the caller passes, as the real client parses it.
 */
export type FakeApiAnswer = object | string | number | boolean | null;

/** An answer, or a function that works one out from the call, for a test that needs more. */
export type FakeApiStub =
  | FakeApiAnswer
  | ((call: FakeApiCall) => FakeApiAnswer | Promise<FakeApiAnswer>);

/** Stubbed answers by method and path, such as `'GET /api/topics'`. */
export type FakeApiStubs = Readonly<Record<`${FakeApiMethod} /${string}`, FakeApiStub>>;

export interface FakeApiClient extends ApiClient {
  /** Every call the client received, in order. */
  readonly calls: readonly FakeApiCall[];
}

/**
 * The statuses each write can refuse with, as the real client returns them. The client throws
 * for any other refusal, so a stub of one would describe an answer no loader sees.
 */
const REFUSAL_STATUSES = {
  put: [400, 409],
  patch: [400, 409],
  post: [400, 409],
  postToMember: [400, 409],
  postStream: [400, 409, 422],
  delete: [409],
} as const;

type WriteName = keyof typeof REFUSAL_STATUSES;

function describeCall({ method, path }: FakeApiCall): string {
  return `${method} ${path}`;
}

function parseStub<T>(call: FakeApiCall, schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new Error(
      `The stubbed answer to ${describeCall(call)} does not match the schema the caller parses it with:\n${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}

/**
 * An `ApiClient` that answers from `stubs` and throws for any call the test did not stub. Each
 * answer is parsed with the schema the caller passes, so a stub that the real API could not
 * have sent fails its test.
 */
export function createFakeApiClient(stubs: FakeApiStubs = {}): FakeApiClient {
  const calls: FakeApiCall[] = [];

  async function answer(call: FakeApiCall): Promise<unknown> {
    calls.push(call);
    const key = describeCall(call);

    const stub = stubs[key as keyof FakeApiStubs];
    if (stub === undefined) {
      throw new Error(`The API was called (${key}) but this test did not stub it`);
    }

    const answered = typeof stub === 'function' ? await stub(call) : stub;

    if (answered instanceof Failure) throw answered.error;
    return answered;
  }

  async function read<T>(call: FakeApiCall, schema: z.ZodType<T>): Promise<T> {
    const answered = await answer(call);

    if (answered instanceof Refusal || answered instanceof NoContent) {
      throw new Error(`A GET answers with a body, but the stub for ${describeCall(call)} has none`);
    }

    return parseStub(call, schema, answered);
  }

  function refusalOf<E>(
    name: WriteName,
    call: FakeApiCall,
    answered: unknown,
    errorSchema: z.ZodType<E>,
  ) {
    if (!(answered instanceof Refusal)) return undefined;

    const statuses: readonly number[] = REFUSAL_STATUSES[name];
    if (!statuses.includes(answered.status)) {
      throw new Error(
        `${name} never returns a ${answered.status} refusal, but the stub for ${describeCall(call)} does`,
      );
    }

    return {
      ok: false as const,
      status: answered.status,
      error: parseStub(call, errorSchema, answered.error),
    };
  }

  async function write<T, E>(
    name: Exclude<WriteName, 'postToMember' | 'delete'>,
    call: FakeApiCall,
    schema: z.ZodType<T>,
    errorSchema: z.ZodType<E>,
  ): Promise<ApiWriteResult<T, E>> {
    const answered = await answer(call);
    const refusal = refusalOf(name, call, answered, errorSchema);
    if (refusal !== undefined) return refusal;

    if (answered instanceof NoContent) {
      throw new Error(
        `${name} answers with a body, but the stub for ${describeCall(call)} has none`,
      );
    }

    return { ok: true, data: parseStub(call, schema, answered) };
  }

  async function writeWithoutBody<E>(
    name: 'postToMember' | 'delete',
    call: FakeApiCall,
    errorSchema: z.ZodType<E>,
  ): Promise<ApiWriteResult<undefined, E>> {
    const answered = await answer(call);
    const refusal = refusalOf(name, call, answered, errorSchema);
    if (refusal !== undefined) return refusal;

    if (!(answered instanceof NoContent)) {
      throw new Error(
        `${name} answers 204 with no body, so stub ${describeCall(call)} with noContent`,
      );
    }

    return { ok: true, data: undefined };
  }

  return {
    calls,

    get(path, schema) {
      return read({ method: 'GET', path }, schema);
    },

    put(path, body, schema, errorSchema) {
      return write('put', { method: 'PUT', path, body }, schema, errorSchema);
    },

    patch(path, body, schema, errorSchema) {
      return write('patch', { method: 'PATCH', path, body }, schema, errorSchema);
    },

    post(path, body, schema, errorSchema) {
      return write('post', { method: 'POST', path, body }, schema, errorSchema);
    },

    postToMember(path, body, errorSchema) {
      return writeWithoutBody('postToMember', { method: 'POST', path, body }, errorSchema);
    },

    postStream(path, body, schema, errorSchema) {
      return write('postStream', { method: 'POST', path, body }, schema, errorSchema);
    },

    delete(path, errorSchema) {
      return writeWithoutBody('delete', { method: 'DELETE', path }, errorSchema);
    },
  };
}
