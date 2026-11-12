import { PassThrough } from 'node:stream';
import { NonceProvider } from '@fphd/ui/nonce';
import { createReadableStreamFromReadable } from '@react-router/node';
import { renderToPipeableStream } from 'react-dom/server';
import {
  type EntryContext,
  type HandleErrorFunction,
  isRouteErrorResponse,
  type RouterContextProvider,
  ServerRouter,
} from 'react-router';

import { loggerContext } from './logger-context.ts';
import { nonceContext } from './nonce-context.ts';

export const streamTimeout = 5_000;

/** Loader, action and render failures. Thrown responses never arrive here, so a not-found page
 * is not an error. The method, url and status are on the request line, under the same `req.id`. */
export const handleError: HandleErrorFunction = (error, { context, request }) => {
  if (request.signal.aborted) return;

  const err =
    isRouteErrorResponse(error) && 'error' in error && error.error !== undefined
      ? error.error
      : error;
  context.get(loggerContext).error({ err }, 'Request failed');
};

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  entryContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  const nonce = loadContext.get(nonceContext);
  const logger = loadContext.get(loggerContext);
  return new Promise<Response>((resolve, reject) => {
    let abortTimeout: ReturnType<typeof setTimeout> | undefined;
    let aborted = false;
    let shellRendered = false;
    const clearAbortTimeout = () => {
      if (abortTimeout !== undefined) {
        clearTimeout(abortTimeout);
        abortTimeout = undefined;
      }
    };
    const { abort, pipe } = renderToPipeableStream(
      <NonceProvider value={nonce}>
        <ServerRouter context={entryContext} nonce={nonce} url={request.url} />
      </NonceProvider>,
      {
        nonce,
        onShellReady() {
          shellRendered = true;
        },
        onAllReady() {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          body.once('close', clearAbortTimeout);
          body.once('finish', clearAbortTimeout);

          responseHeaders.set('Content-Type', 'text/html');
          resolve(new Response(stream, { headers: responseHeaders, status: responseStatusCode }));
          pipe(body);
        },
        onShellError(error: unknown) {
          clearAbortTimeout();
          reject(error);
        },
        onError(error: unknown) {
          // A deadline abort flushes the available shell and each unfinished section's retry UI.
          if (!aborted) responseStatusCode = 500;
          // Shell failures reach React Router through onShellError instead.
          if (shellRendered && !request.signal.aborted) {
            logger.error({ err: error }, 'Streaming failed');
          }
        },
      },
    );

    abortTimeout = setTimeout(() => {
      aborted = true;
      abort();
    }, streamTimeout + 1_000);
  });
}
