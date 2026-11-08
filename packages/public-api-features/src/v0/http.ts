import { createHash } from 'node:crypto';
import { STATUS_CODES } from 'node:http';

import { z } from '@fphd/config/zod';
import { stringify } from 'csv-stringify/sync';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';

/** A parameter the API refused, and why, as problem details list them. */
export interface InvalidParam {
  name: string;
  reason: string;
}

/** An RFC 9457 problem details response, with `error` as the machine-readable code. */
export function sendProblem(
  response: Response,
  status: number,
  error: string,
  detail?: string,
  invalidParams?: readonly InvalidParam[],
): void {
  response
    .status(status)
    .type('application/problem+json')
    .json({
      type: 'about:blank',
      title: STATUS_CODES[status],
      status,
      error,
      ...(detail === undefined ? {} : { detail }),
      ...(invalidParams === undefined ? {} : { invalidParams }),
    });
}

export type Format = 'csv' | 'json';

const MEDIA_TYPES: Record<Format, string> = { csv: 'text/csv', json: 'application/json' };

/**
 * The format `Accept` asks for, from the ones a route offers, or undefined after sending 406.
 * The first offer is the default, so a request with no `Accept`, or `*\/*`, gets it.
 */
export function negotiate<F extends Format>(
  request: Request,
  response: Response,
  offers: readonly F[],
): F | undefined {
  const accepted = request.accepts(offers.map((offer) => MEDIA_TYPES[offer]));
  const format = offers.find((offer) => MEDIA_TYPES[offer] === accepted);

  if (format === undefined) {
    sendProblem(
      response,
      406,
      'not_acceptable',
      `This route returns ${offers.map((offer) => MEDIA_TYPES[offer]).join(' or ')}.`,
    );
  }

  return format;
}

/** A route's query parameters: each one a single string, and no others. */
export type QueryShape = Record<string, z.ZodType<string | undefined>>;

/**
 * The query parsed against a route's parameters, or undefined after sending 400. A parameter
 * the route doesn't take is an error rather than ignored, so a typo can't silently widen the
 * result. A parameter given twice is an error too: lists are comma-separated.
 */
export function parseQuery<S extends QueryShape>(
  request: Request,
  response: Response,
  shape: S,
): z.infer<z.ZodObject<S>> | undefined {
  const result = z.strictObject(shape).safeParse(request.query);

  if (result.success) return result.data;

  const unknown = result.error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys' ? issue.keys : [],
  );

  if (unknown.length > 0) {
    sendProblem(
      response,
      400,
      'unknown_parameter',
      `The API has no parameter called ${unknown.map((key) => `\`${key}\``).join(', ')}.`,
      unknown.map((name) => ({ name, reason: 'unknown parameter' })),
    );
    return undefined;
  }

  sendInvalid(
    response,
    result.error.issues.map((issue) => ({
      name: String(issue.path[0]),
      reason: Array.isArray(request.query[String(issue.path[0])])
        ? 'given more than once'
        : issue.message,
    })),
  );
  return undefined;
}

/** 400 for parameters that are each valid but can't be used as given. */
export function sendInvalid(response: Response, invalidParams: readonly InvalidParam[]): void {
  sendProblem(
    response,
    400,
    'invalid_parameter',
    invalidParams.map(({ name, reason }) => `\`${name}\`: ${reason}.`).join(' '),
    invalidParams,
  );
}

/** A comma-separated list of values that each match `pattern`. */
export function listParam(pattern: RegExp, description: string) {
  return z
    .string()
    .refine((value) => value.split(',').every((item) => pattern.test(item)), {
      message: `must be ${description}, separated by commas`,
    })
    .optional();
}

/** The items of a comma-separated list parameter, or undefined if it wasn't given. */
export function listItems(value: string | undefined): string[] | undefined {
  return value === undefined ? undefined : value.split(',');
}

const MAX_AGE_SECONDS = 300;

/**
 * Sets the caching headers and answers a conditional request, returning true after a 304.
 * The ETag changes with the data version and with what was asked for, so it can be checked
 * before any query runs.
 */
export function notModified(
  request: Request,
  response: Response,
  dataVersion: string,
  format: Format,
): boolean {
  const tag = createHash('sha256')
    .update(`${dataVersion}\n${request.originalUrl}\n${format}`)
    .digest('base64url')
    .slice(0, 27);

  response.set('ETag', `"${tag}"`);
  response.set('Cache-Control', `public, max-age=${MAX_AGE_SECONDS}`);
  response.vary('Accept');

  if (!request.fresh) return false;

  response.status(304).end();
  return true;
}

/** A row's value at a dotted column path, as a CSV cell. */
function cell(row: object, column: string): string {
  let value: unknown = row;
  for (const key of column.split('.')) {
    value = typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
  }
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(' ');
  return String(value);
}

/**
 * A table in the negotiated format. In JSON, rows go in `data` as they are. In CSV, the columns
 * are the JSON field paths joined with dots, in the order given.
 */
export function sendTable(
  response: Response,
  format: Format,
  columns: readonly string[],
  rows: readonly object[],
): void {
  if (format === 'json') {
    response.json({ data: rows });
    return;
  }

  response.type('text/csv; charset=utf-8').send(
    stringify(
      rows.map((row) => columns.map((column) => cell(row, column))),
      { header: true, columns: [...columns], record_delimiter: '\r\n' },
    ),
  );
}

/** Lets any website call the API, and read the headers a client needs. */
export const cors: RequestHandler = (request, response, next) => {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Expose-Headers', 'ETag, Link');

  if (request.method !== 'OPTIONS') {
    next();
    return;
  }

  response.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Accept, If-None-Match');
  response.set('Access-Control-Max-Age', '86400');
  response.status(204).end();
};

/** A path under the version that no route answers. */
export const notFound: RequestHandler = (_request, response) => {
  sendProblem(response, 404, 'not_found');
};

/** A thrown error as a 500 problem, with the error on the request's log line. */
export const handleError: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  // pino-http attaches `res.err` to the request line, so the failure joins on `req.id`.
  (response as Response & { err?: Error }).err =
    error instanceof Error ? error : new Error(String(error));
  sendProblem(response, 500, 'internal_error');
};
