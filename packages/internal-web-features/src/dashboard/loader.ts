// No @fphd/ui imports here, so the loader unit-tests without the jsdom the components need.
import {
  canAssignReviewers,
  canBrowseAllIndicators,
  canCreateIndicator,
  canDecideUpdates,
  canReviewIndicators,
  canSchedulePublication,
} from '@fphd/auth/permissions';
import {
  indicatorAdminPageSchema,
  indicatorPageQuerySchema,
  indicatorsScheduledSchema,
  indicatorsToReviewSchema,
  indicatorsUnderReviewSchema,
  updatesAwaitingDecisionSchema,
} from '@fphd/internal-api-features/contract';
import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { takeFlash } from '@fphd/web-server/flash';
import { getSession } from '@fphd/web-server/session';
import type { LoaderFunctionArgs } from 'react-router';

import { queryObject } from '../query-object.ts';
import { dashboardNotification } from './notifications.ts';

export type {
  IndicatorAdminListItem,
  IndicatorsUnderReview,
} from '@fphd/internal-api-features/contract';

function notFound(): Response {
  return new Response('Not Found', { status: 404 });
}

async function loadIndicatorList(api: ApiClient, page: number, ownTeams: boolean) {
  const teams = ownTeams ? '&teams=own' : '';
  const { indicators, pageSize, total } = await api.get(
    `/api/internal/indicators?page=${page}${teams}`,
    indicatorAdminPageSchema,
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (page > totalPages) throw notFound();

  return { indicators, page, totalPages };
}

/**
 * An IMRG manager sees the indicators under review, an IMRG reviewer the indicators assigned to
 * them, an admin the approved indicators waiting to be published and the submitted updates
 * waiting for their decision, and an admin or anyone else a page of the indicators they work on.
 * A user with several of these roles, or one who also publishes, sees each. An invalid page
 * number, or a page past the first for someone with no list, is a 404.
 */
export async function loadDashboard({ context, request }: LoaderFunctionArgs) {
  const query = indicatorPageQuerySchema.safeParse(queryObject(new URL(request.url).searchParams));

  if (!query.success) throw notFound();

  const session = getSession(context);
  const managing = session !== undefined && canAssignReviewers(session);
  const reviewing = session !== undefined && canReviewIndicators(session);
  const canCreate = session !== undefined && canCreateIndicator(session);
  const browsing = session !== undefined && canBrowseAllIndicators(session);
  const scheduling = session !== undefined && canSchedulePublication(session);
  const deciding = session !== undefined && canDecideUpdates(session);
  const listing = (!managing && !reviewing) || canCreate || browsing;
  const { page } = query.data;

  if (!listing && page > 1) throw notFound();

  const api = context.get(apiContext);
  const [underReview, toReview, scheduled, awaitingDecision, list] = await Promise.all([
    managing ? api.get('/api/internal/indicators-under-review', indicatorsUnderReviewSchema) : null,
    reviewing
      ? api
          .get('/api/internal/indicators-to-review', indicatorsToReviewSchema)
          .then(({ indicators }) => indicators)
      : null,
    scheduling
      ? api
          .get('/api/internal/indicators-scheduled', indicatorsScheduledSchema)
          .then(({ indicators }) => indicators)
      : null,
    deciding
      ? api
          .get('/api/internal/updates-awaiting-decision', updatesAwaitingDecisionSchema)
          .then(({ indicators }) => indicators)
      : null,
    listing ? loadIndicatorList(api, page, (managing || reviewing) && !browsing) : null,
  ]);

  return {
    underReview,
    toReview,
    scheduled,
    awaitingDecision,
    list: list === null ? null : { canCreate, ...list },
    // Taken after the fetches, so a failed page load does not consume the message it would show.
    notification: dashboardNotification(takeFlash(context)),
  };
}
