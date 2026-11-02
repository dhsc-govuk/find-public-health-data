import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import type { BlobStorage } from '@fphd/internal-storage';
import { Router } from 'express';
import { internalCiMethodsRouter } from './ci-methods.ts';
import { internalDataProvidersRouter } from './data-providers.ts';
import { dataTableCheckRouter } from './data-table-check.ts';
import { dataUploadsRouter } from './data-uploads.ts';
import { indicatorSectionsRouter } from './indicator-sections.ts';
import { indicatorSubmissionsRouter } from './indicator-submissions.ts';
import { internalIndicatorsRouter } from './indicators.ts';
import { internalIndicatorsUnderReviewRouter } from './indicators-under-review.ts';
import { internalNotesForReviewersRouter } from './notes-for-reviewers.ts';
import type { InternalRepositories } from './repositories.ts';
import { internalReviewersRouter } from './reviewers.ts';
import { internalTagsRouter } from './tags.ts';
import { internalTopicsRouter } from './topics.ts';
import { internalValueTypesAndUnitsRouter } from './value-types-and-units.ts';

export { createInternalRepositories, type InternalRepositories } from './repositories.ts';

export interface InternalApiDependencies {
  repositories: InternalRepositories;
  session: JwtSessionVerifier;
  storage: BlobStorage;
}

/**
 * Every route on the internal-only surface, in one router. `public-api` never mounts this,
 * and `tools/artefact-boundary` checks that no public artifact can reach it.
 */
export function internalApiRoutes({
  repositories,
  session,
  storage,
}: InternalApiDependencies): Router {
  const router = Router();

  router.use(internalIndicatorsRouter(repositories.indicators, session));
  router.use(internalIndicatorsUnderReviewRouter(repositories.indicators, session));
  router.use(indicatorSectionsRouter(repositories, session));
  router.use(indicatorSubmissionsRouter(repositories.indicators, session));
  router.use(internalReviewersRouter(repositories.reviewers, repositories.indicators, session));
  router.use(internalNotesForReviewersRouter(repositories.indicators, session));
  router.use(
    dataUploadsRouter(repositories.dataUploads, repositories.indicators, storage, session),
  );
  router.use(dataTableCheckRouter(repositories.dataUploads, repositories.indicators, session));
  router.use(internalCiMethodsRouter(repositories.ciMethods, session));
  router.use(internalTagsRouter(repositories.tags, session));
  router.use(internalDataProvidersRouter(repositories.dataProviders, session));
  router.use(internalTopicsRouter(repositories.topics, session));
  router.use(internalValueTypesAndUnitsRouter(repositories.valueTypesAndUnits, session));

  return router;
}
