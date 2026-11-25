import { requireApiActor } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canEditIndicator } from '@fphd/auth/permissions';
import { Router } from 'express';

import {
  type DataTableCheck,
  type DataTableConfirmationError,
  type DataTableConfirmed,
  dataTableConfirmationSchema,
  dataTablePageQuerySchema,
} from './data-table-check-contract.ts';
import { type DataTableValues, dataTableValuesQuerySchema } from './data-table-filter-contract.ts';
import {
  guardedIndicator,
  type IndicatorAccessReader,
  requireIndicatorAccess,
} from './indicator-access.ts';
import type { InternalDataUploadRepository } from './repositories.ts';

/** Routes for paging through, filtering and confirming the draft's uploaded data table. */
export function dataTableCheckRouter(
  dataUploads: InternalDataUploadRepository,
  indicators: IndicatorAccessReader,
  session: JwtSessionVerifier,
): Router {
  const router = Router();
  const requireEditor = requireIndicatorAccess(session, indicators, canEditIndicator);

  router.get(
    '/api/internal/indicators/:id/data-table',
    requireEditor,
    async (request, response) => {
      const { id } = guardedIndicator(response);

      const query = dataTablePageQuerySchema.safeParse(request.query);

      if (!query.success) {
        response.status(400).json({ error: 'invalid_page' });
        return;
      }

      const found = await dataUploads.findDraftDataTable(id);

      // A published indicator has no data table to check until someone opens a draft of it.
      if (!found.found) {
        response.status(found.reason === 'locked' ? 409 : 404).json({ error: found.reason });
        return;
      }

      const { page, rowsPerPage, filterIds } = query.data;
      const { dataTable } = found;
      const body: DataTableCheck = {
        dataTable:
          dataTable === null
            ? null
            : {
                ...dataTable,
                page,
                rowsPerPage,
                ...(await dataUploads.readPage(dataTable, { page, rowsPerPage, filterIds })),
              },
      };

      response.status(200).json(body);
    },
  );

  router.get(
    '/api/internal/indicators/:id/data-table/values',
    requireEditor,
    async (request, response) => {
      const { id } = guardedIndicator(response);

      const query = dataTableValuesQuerySchema.safeParse(request.query);

      if (!query.success) {
        response.status(400).json({ error: 'invalid_query' });
        return;
      }

      const found = await dataUploads.findDraftDataTable(id);

      if (!found.found) {
        response.status(found.reason === 'locked' ? 409 : 404).json({ error: found.reason });
        return;
      }

      const { dataTable } = found;
      const body: DataTableValues = {
        columns: dataTable === null ? [] : await dataUploads.listValues(dataTable, query.data),
      };

      response.status(200).json(body);
    },
  );

  router.put(
    '/api/internal/indicators/:id/data-table/confirmation',
    requireEditor,
    async (request, response) => {
      const { id } = guardedIndicator(response);

      const submission = dataTableConfirmationSchema.safeParse(request.body);

      if (!submission.success) {
        // As a section save does, a locked draft answers locked before its refused answers.
        if ((await dataUploads.findDraft(id))?.isLocked) {
          response.status(409).json({ error: 'locked' });
          return;
        }

        response
          .status(400)
          .json({ error: 'validation_failed' } satisfies DataTableConfirmationError);
        return;
      }

      const actor = requireApiActor(request, response);
      const { batchId } = submission.data;
      const result = await dataUploads.confirm(id, batchId, actor);

      if (!result.ok) {
        if (result.reason === 'data_table_changed' || result.reason === 'locked') {
          response.status(409).json({ error: result.reason } satisfies DataTableConfirmationError);
        } else {
          response.status(404).json({ error: result.reason });
        }
        return;
      }

      request.log.info({ indicatorId: id, uploadBatchId: batchId }, 'Data table confirmed');
      response.status(200).json({
        confirmedAt: result.confirmedAt.toISOString(),
      } satisfies DataTableConfirmed);
    },
  );

  return router;
}
