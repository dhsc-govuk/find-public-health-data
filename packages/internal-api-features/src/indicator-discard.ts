import { requireApiActor } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canDiscardDraft } from '@fphd/auth/permissions';
import type { BlobStorage } from '@fphd/internal-storage';
import { Router } from 'express';

import { deleteBlob } from './blob-deletion.ts';
import { type IndicatorDiscardError, indicatorDiscardSchema } from './contract.ts';
import { guardedIndicator, requireIndicatorAccess } from './indicator-access.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/**
 * POST `/api/internal/indicators/:id/discard`: a publisher deleting a draft no review has started
 * on. A repeat finds no draft to delete, and no indicator either when it was new.
 */
export function indicatorDiscardRouter(
  indicators: Pick<InternalIndicatorRepository, 'discardDraft' | 'findAccess'>,
  storage: BlobStorage,
  session: JwtSessionVerifier,
): Router {
  const router = Router();

  router.post(
    '/api/internal/indicators/:id/discard',
    requireIndicatorAccess(session, indicators, canDiscardDraft),
    async (request, response) => {
      const { id } = guardedIndicator(response);

      const body = indicatorDiscardSchema.safeParse(request.body);

      if (!body.success) {
        response
          .status(400)
          .json({ error: 'invalid_draft_updated_at' } satisfies IndicatorDiscardError);
        return;
      }

      const result = await indicators.discardDraft(
        id,
        new Date(body.data.draftUpdatedAt),
        requireApiActor(request, response),
      );

      if (!result.ok) {
        response.status(409).json({ error: result.reason } satisfies IndicatorDiscardError);
        return;
      }

      request.log.info(
        { indicatorId: id, indicatorDeleted: result.indicatorDeleted },
        'Indicator draft discarded',
      );
      response.status(204).end();

      for (const name of result.deletedBlobNames) await deleteBlob(request, storage, name);
    },
  );

  return router;
}
