import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canSeeIndicator } from '@fphd/auth/permissions';
import type { FoundIndicatorDetail, Repositories } from '@fphd/db';
import type { IndicatorDataState } from '@fphd/utils/indicator-page';
import { Router } from 'express';

import { guardedIndicator, requireIndicatorAccess } from './indicator-access.ts';
import type { PreviewRepositories, PreviewVersion } from './preview-repository.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/** Where the preview mounts the public API again, for the indicator `:id`. */
export const PREVIEW_API_PATH = '/api/internal/indicators/:id/preview';

/**
 * The preview's detail: the detail as the preview's views hold it, with the questions the draft
 * leaves unanswered, and whether the preview can show its data.
 */
export type PreviewIndicatorDetail = FoundIndicatorDetail & { dataState: IndicatorDataState };

/**
 * The public API's routes, which `@fphd/public-api-features` builds and the app passes in. The
 * preview gives them its own repositories and its own detail.
 */
export type PublicApiRoutes = (
  repositories: Repositories,
  options: {
    detailBody: (
      found: FoundIndicatorDetail,
      indicatorId: string,
    ) => Promise<PreviewIndicatorDetail | undefined>;
  },
) => Router;

export interface InternalPreviewRepository {
  /** The draft or scheduled version the indicator's preview shows, or undefined for neither. */
  findVersion(indicatorId: string): Promise<PreviewVersion | undefined>;
  /** The repositories a preview of `version` reads through, made for one request. */
  repositoriesFor(version: PreviewVersion): PreviewRepositories;
}

/**
 * The public API again, under `PREVIEW_API_PATH`, showing the indicator's draft or scheduled
 * version as if it alone had been published. Anyone who can see the indicator's overview can
 * preview it. The server chooses the version, so the address never names one. Each request
 * gets repositories of its own, because what they read depends on the version.
 */
export function indicatorPreviewRouter(
  preview: InternalPreviewRepository,
  indicators: InternalIndicatorRepository,
  session: JwtSessionVerifier,
  publicRoutes: PublicApiRoutes,
): Router {
  const router = Router();
  const requireViewer = requireIndicatorAccess(session, indicators, canSeeIndicator);

  router.use(PREVIEW_API_PATH, requireViewer, async (request, response, next) => {
    const { id } = guardedIndicator(response);
    const version = await preview.findVersion(id);

    if (version === undefined) {
      response.status(404).json({ error: 'no_draft' });
      return;
    }

    const repositories = preview.repositoriesFor(version);
    // The preview's detail endpoint answers with the detail as found, which the public one
    // never does, so the preview page can show what the draft leaves unanswered.
    const detailBody = async (found: FoundIndicatorDetail, indicatorId: string) => {
      const dataState = await repositories.findDataState(indicatorId);
      return dataState === undefined ? undefined : { ...found, dataState };
    };

    publicRoutes(repositories, { detailBody })(request, response, next);
  });

  return router;
}
