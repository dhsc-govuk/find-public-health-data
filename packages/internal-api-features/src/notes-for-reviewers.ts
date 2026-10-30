import { requireApiSession, requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canListIndicators, canSeeNotesForReviewers } from '@fphd/auth/permissions';
import { Router } from 'express';

import { indicatorAccess, indicatorIdSchema, type NotesForReviewers } from './contract.ts';
import {
  justificationsColumns,
  otherCommentsColumns,
  varianceAndQualityColumns,
} from './indicator-section-columns.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/**
 * GET `/api/internal/indicators/:id/notes-for-reviewers`: the answers to the sections the
 * publisher writes for its reviewers, from the draft or, with none, the published version, for
 * those `canSeeNotesForReviewers` allows. Anyone else gets 404 `not_found`.
 */
export function internalNotesForReviewersRouter(
  indicators: Pick<
    InternalIndicatorRepository,
    'findById' | 'findDraftState' | 'findPublishedVersion'
  >,
  session: JwtSessionVerifier,
): Router {
  const router = Router();

  router.get(
    '/api/internal/indicators/:id/notes-for-reviewers',
    requireJwtSession(session, canListIndicators),
    async (request, response) => {
      const id = indicatorIdSchema.safeParse(request.params.id);

      if (!id.success) {
        response.status(400).json({ error: 'invalid_id' });
        return;
      }

      const row = await indicators.findById(id.data);

      if (!row || !canSeeNotesForReviewers(requireApiSession(response), indicatorAccess(row))) {
        response.status(404).json({ error: 'not_found' });
        return;
      }

      const version =
        row.draftStatus === null
          ? await indicators.findPublishedVersion(id.data)
          : (await indicators.findDraftState(id.data))?.draft;

      // Every indicator has a draft, a published version or both.
      if (!version) throw new Error('the indicator has no version to read');

      const body: NotesForReviewers = {
        varianceAndQuality: varianceAndQualityColumns.fromDraft(version),
        justifications: justificationsColumns.fromDraft(version),
        otherComments: otherCommentsColumns.fromDraft(version),
      };

      response.status(200).json(body);
    },
  );

  return router;
}
