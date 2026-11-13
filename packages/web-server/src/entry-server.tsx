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
    const deadlineError = new Error('Document render deadline exceeded');
    let deadlineExpired = false;
    let deadlineLogged = false;
    let unfinishedSections = 0;
    let allReady = false;
    const logDeadline = (sections?: number) => {
      if (!deadlineExpired || deadlineLogged) return;
      deadlineLogged = true;
      logger.warn(
        { url: request.url, ...(sections === undefined ? {} : { unfinishedSections: sections }) },
        'Document render deadline exceeded',
      );
    };
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
        // Large completed boundaries must stay inline, rather than need scripts to replace fallbacks.
        progressiveChunkSize: Number.POSITIVE_INFINITY,
        onShellReady() {
          shellRendered = true;
        },
        onAllReady() {
          logDeadline(unfinishedSections);
          allReady = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          body.once('close', clearAbortTimeout);
          body.once('finish', clearAbortTimeout);

          responseHeaders.set('Content-Type', 'text/html');
          resolve(new Response(stream, { headers: responseHeaders, status: responseStatusCode }));
          pipe(body);
        },
        onShellError(error: unknown) {
          logDeadline();
          clearAbortTimeout();
          reject(error);
        },
        onError(error: unknown) {
          // React reports the supplied abort reason for each unfinished boundary.
          if (deadlineExpired && error === deadlineError) {
            unfinishedSections += 1;
            return;
          }
          responseStatusCode = 500;
          // Shell failures reach React Router through onShellError instead.
          if (shellRendered && !request.signal.aborted) {
            logger.error({ err: error }, 'Streaming failed');
          }
        },
      },
    );

    abortTimeout = setTimeout(() => {
      deadlineExpired = true;
      // Streaming can outlast onAllReady, when React can no longer count pending boundaries.
      if (allReady) logDeadline();
      abort(deadlineError);
    }, streamTimeout + 1_000);
  });
}
