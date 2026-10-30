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
 * GET `/api/internal/indicators/:id/notes-for-reviewers`: the draft's answers to the sections
 * the publisher writes for its reviewers, for those `canSeeNotesForReviewers` allows, while the
 * draft is locked for review and so holds what was submitted.
 *
 * Errors:
 * - 404 `not_found`: no such indicator, or one the user may not read the notes of.
 * - 404 `no_draft`: the indicator has no draft.
 * - 404 `not_submitted`: the draft is not locked for review, as before it is submitted or
 *   after a withdrawal.
 */
export function internalNotesForReviewersRouter(
  indicators: Pick<InternalIndicatorRepository, 'findById' | 'findDraftState'>,
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

      if (row.draftStatus === null) {
        response.status(404).json({ error: 'no_draft' });
        return;
      }

      if (!row.draftLocked) {
        response.status(404).json({ error: 'not_submitted' });
        return;
      }

      const draft = (await indicators.findDraftState(id.data))?.draft;

      if (!draft) throw new Error('the draft just found could not be read');

      const body: NotesForReviewers = {
        varianceAndQuality: varianceAndQualityColumns.fromDraft(draft),
        justifications: justificationsColumns.fromDraft(draft),
        otherComments: otherCommentsColumns.fromDraft(draft),
      };

      response.status(200).json(body);
    },
  );

  return router;
}
