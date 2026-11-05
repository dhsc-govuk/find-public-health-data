import { requireApiActor } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canEditIndicator } from '@fphd/auth/permissions';
import type { BlobStorage } from '@fphd/internal-storage';
import { type Request, type Response, Router } from 'express';
import { v7 as uuidv7 } from 'uuid';

import type {
  DataUploadCreated,
  DataUploadError,
  DataUploadLatest,
} from './data-upload-contract.ts';
import { drainRequest, receiveDataTable, UploadAbortedError } from './data-upload-receive.ts';
import { elapsedMs, TimedUploadError, type UploadTimings } from './data-upload-timings.ts';
import {
  guardedIndicator,
  type IndicatorAccessReader,
  requireIndicatorAccess,
} from './indicator-access.ts';
import type { InternalDataUploadRepository } from './repositories.ts';

/** An upload route's draft, or the answer to give when the address names none. */
export type UploadDraftLookup =
  | { ok: true; indicatorId: string; draftId: string }
  | { ok: false; status: 404; body: { error: 'not_found' | 'no_draft' } }
  | { ok: false; status: 409; body: { error: 'locked' } };

/** Finds the draft of the indicator an upload route guards, without answering the request. */
export async function findUploadDraft(
  dataUploads: InternalDataUploadRepository,
  indicatorId: string,
): Promise<UploadDraftLookup> {
  const draft = await dataUploads.findDraft(indicatorId);

  // A published indicator is edited by opening a draft first, so until then there is nothing
  // to upload to.
  if (draft === undefined) return { ok: false, status: 404, body: { error: 'not_found' } };
  if (draft === null) return { ok: false, status: 404, body: { error: 'no_draft' } };
  if (draft.isLocked) return { ok: false, status: 409, body: { error: 'locked' } };

  return { ok: true, indicatorId, draftId: draft.id };
}

/** Answers once the request is read to its end, so the answer never races an upload body. */
async function refuse(request: Request, response: Response, status: number, body: object) {
  await drainRequest(request);
  response.status(status).json(body);
}

/**
 * The data table upload: the file is streamed to storage as it arrives, then read back, checked
 * and loaded while the publisher waits. Uploading again replaces the draft's data.
 */
export function dataUploadsRouter(
  dataUploads: InternalDataUploadRepository,
  indicators: IndicatorAccessReader,
  storage: BlobStorage,
  session: JwtSessionVerifier,
): Router {
  const router = Router();
  const requireEditor = requireIndicatorAccess(session, indicators, canEditIndicator);

  router.post(
    '/api/internal/indicators/:id/data-uploads',
    requireEditor,
    async (request, response) => {
      const started = performance.now();
      const draft = await findUploadDraft(dataUploads, guardedIndicator(response).id);
      if (!draft.ok) {
        await refuse(request, response, draft.status, draft.body);
        return;
      }

      // The stages' timings for the log line, with the receipt and the whole request around them.
      let receiveMs: number | undefined;
      const timingsWith = (stages: UploadTimings): UploadTimings => ({
        ...(receiveMs === undefined ? {} : { receiveMs }),
        ...stages,
        totalMs: elapsedMs(started),
      });

      const { indicatorId } = draft;
      const actor = requireApiActor(request, response);
      const batchId = uuidv7();
      const blobName = `${indicatorId}/${batchId}.csv`;
      const logFields = { indicatorId, uploadBatchId: batchId };

      const abandoned = new AbortController();
      response.on('close', () => {
        if (!response.writableFinished) abandoned.abort(new UploadAbortedError());
      });

      const deleteBlob = (name: string) =>
        storage
          .delete(name)
          .catch((error: unknown) =>
            request.log.warn({ err: error, blobName: name }, 'Blob not deleted'),
          );

      try {
        const received = await receiveDataTable(request, storage, blobName);
        receiveMs = elapsedMs(started);

        if (!received.ok) {
          await deleteBlob(blobName);
          response.status(400).json({
            error: 'validation_failed',
            fieldErrors: { dataTable: received.message },
          } satisfies DataUploadError);
          return;
        }

        const { ok: _ok, ...file } = received;
        const result = await dataUploads.process(
          { batchId, indicatorId, blobName, actor, ...file },
          () => storage.get(blobName),
          abandoned.signal,
        );

        // The draft was locked or stopped being a draft while the file loaded.
        if (!result.ok && result.reason !== 'invalid') {
          await deleteBlob(blobName);
          response.status(result.reason === 'locked' ? 409 : 404).json({ error: result.reason });
          return;
        }

        const timings = timingsWith(result.timings);
        if (result.ok) {
          request.log.info(
            { ...logFields, byteSize: file.byteSize, rowCount: result.rowCount, timings },
            'Data table uploaded',
          );
          response
            .status(201)
            .json({ id: batchId, rowCount: result.rowCount } satisfies DataUploadCreated);
        } else {
          request.log.info(
            {
              ...logFields,
              byteSize: file.byteSize,
              problems: result.problems.map(({ code }) => code),
              timings,
            },
            'Data table refused',
          );
          response.status(422).json({
            error: 'invalid_data_table',
            id: batchId,
            problems: result.problems,
          } satisfies DataUploadError);
        }

        // Only now are the deletions committed: a failure leaves an orphan blob, never a lost one.
        for (const name of result.deletedBlobNames) await deleteBlob(name);
      } catch (error) {
        await deleteBlob(blobName);
        const timings = timingsWith(error instanceof TimedUploadError ? error.timings : {});
        if (abandoned.signal.aborted || error instanceof UploadAbortedError) {
          request.log.info({ ...logFields, timings }, 'Data table upload abandoned');
          return;
        }
        request.log.info({ ...logFields, timings }, 'Data table upload failed');
        throw error instanceof TimedUploadError ? error.cause : error;
      }
    },
  );

  router.get(
    '/api/internal/indicators/:id/data-uploads/latest',
    requireEditor,
    async (request, response) => {
      const draft = await findUploadDraft(dataUploads, guardedIndicator(response).id);
      if (!draft.ok) {
        await refuse(request, response, draft.status, draft.body);
        return;
      }

      const latest = await dataUploads.findLatest(draft.draftId);
      const body: DataUploadLatest = {
        latestUpload:
          latest === undefined ? null : { ...latest, uploadedAt: latest.uploadedAt.toISOString() },
      };

      response.status(200).json(body);
    },
  );

  return router;
}
