import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canSeeNotesForReviewers } from '@fphd/auth/permissions';
import { Router } from 'express';

import type { NotesForReviewers } from './contract.ts';
import { guardedIndicator, requireIndicatorAccess } from './indicator-access.ts';
import {
  justificationsColumns,
  otherCommentsColumns,
  varianceAndQualityColumns,
} from './indicator-section-columns.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/**
 * GET `/api/internal/indicators/:id/notes-for-reviewers`: the answers to the sections the
 * publisher writes for its reviewers, from the draft or, with none, the published version, for
 * those `canSeeNotesForReviewers` allows.
 */
export function internalNotesForReviewersRouter(
  indicators: Pick<InternalIndicatorRepository, 'findAccess' | 'findNotesForReviewers'>,
  session: JwtSessionVerifier,
): Router {
  const router = Router();

  router.get(
    '/api/internal/indicators/:id/notes-for-reviewers',
    requireIndicatorAccess(session, indicators, canSeeNotesForReviewers),
    async (_request, response) => {
      const { id } = guardedIndicator(response);

      const row = await indicators.findNotesForReviewers(id);

      if (!row) {
        response.status(404).json({ error: 'not_found' });
        return;
      }

      const { version } = row;
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
