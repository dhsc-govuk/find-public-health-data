import type { IncomingMessage } from 'node:http';

import { type Logger, serializeError } from '@fphd/logger';
import type { RequestHandler } from 'express';
import { pinoHttp, type StdSerializedResults } from 'pino-http';

import { REQUEST_ID_HEADER, readRequestIdHeader, requestId, uuidv7 } from './request-id.ts';

const probePaths = new Set(['/livez', '/readyz']);

function pathOf(url: string | undefined): string {
  return url?.split('?', 1)[0] ?? '';
}

interface ErrorObject {
  err: unknown;
  res: unknown;
  responseTime: number;
}

function optional<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]: string });
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Front Door sets X-Azure-Ref; a web app's call to its API stays inside the environment. */
function relayedByFrontDoor(headers: IncomingMessage['headers']): boolean {
  return headers['x-azure-ref'] !== undefined;
}

export interface RequestLoggingOptions {
  /** On for an API, whose callers include its web app: keep the id the web app forwarded, so its
   * line and this one share it, and record whether a web app or an outside client made the
   * request. Off for the web apps themselves: a browser's header is never trusted. A request
   * relayed by Front Door came from outside, not from a web app, so its id is never kept. */
  servesWebApps?: boolean;
}

/** One line per response through the shared logger, so requests filter and aggregate like every
 * other line. Probes are skipped: their traffic would otherwise dominate the log. */
export function requestLogging(
  logger: Logger,
  { servesWebApps = false }: RequestLoggingOptions = {},
): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (request, response) => {
      const forwarded =
        servesWebApps && !relayedByFrontDoor(request.headers)
          ? readRequestIdHeader(request.headers[REQUEST_ID_HEADER])
          : undefined;
      const id = forwarded ?? uuidv7();
      // Echoed to the caller, so whoever made the request can find its lines.
      response.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    autoLogging: { ignore: (request) => probePaths.has(pathOf(request.url)) },
    customLogLevel: (_request, response) => (response.statusCode >= 500 ? 'error' : 'info'),
    // A 5xx with no error attached gets one invented by pino-http, whose stack points at itself.
    customErrorObject: (_request, response, _error, { err, ...rest }: ErrorObject) =>
      response.err === undefined ? rest : { err, ...rest },
    // No headers (one is the session cookie) and no client address (personal data, and the edge
    // access log already has it). Only the Front Door reference below is kept.
    serializers: {
      req: (request: StdSerializedResults['req']) => ({
        id: request.id,
        method: request.method,
        url: request.url,
        // Front Door's reference for the request, the same value its access log records.
        ...optional('azureRef', singleHeader(request.headers['x-azure-ref'])),
        ...(servesWebApps
          ? { source: relayedByFrontDoor(request.headers) ? 'external' : 'web' }
          : {}),
      }),
      res: (response: StdSerializedResults['res']) => ({ statusCode: response.statusCode }),
      // pino-http would otherwise replace the logger's own, which keeps query parameters out.
      err: serializeError,
    },
  });
}

/** A logger with the request id populated, so a request can be traced through every line that
 * uses it. Don't pass a `req` to it: pino writes the key twice and the existing `req.id` is lost. */
export function requestAwareLogger(logger: Logger, request: IncomingMessage): Logger {
  const id = requestId(request);

  return id === undefined ? logger : logger.child({ req: { id } });
}
