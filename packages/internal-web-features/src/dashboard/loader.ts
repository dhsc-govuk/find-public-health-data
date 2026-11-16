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
  indicatorSearchQuerySchema,
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

/** An API list's path, with the dashboard's search when there is one. */
function listPath(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const search = params.toString();
  return search === '' ? path : `${path}?${search}`;
}

async function loadIndicatorList(
  api: ApiClient,
  page: number,
  ownTeams: boolean,
  search: string | undefined,
) {
  const { indicators, pageSize, total } = await api.get(
    listPath('/api/internal/indicators', {
      page: String(page),
      teams: ownTeams ? 'own' : undefined,
      search,
    }),
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
 * A user with several of these roles, or one who also publishes, sees each. A search narrows
 * every list to its matches. An invalid page number or search, or a page past the first for
 * someone with no list, is a 404.
 */
export async function loadDashboard({ context, request }: LoaderFunctionArgs) {
  const params = queryObject(new URL(request.url).searchParams);
  const query = indicatorPageQuerySchema.safeParse(params);
  const searchQuery = indicatorSearchQuerySchema.safeParse(params);

  if (!query.success || !searchQuery.success) throw notFound();

  const session = getSession(context);
  const managing = session !== undefined && canAssignReviewers(session);
  const reviewing = session !== undefined && canReviewIndicators(session);
  const canCreate = session !== undefined && canCreateIndicator(session);
  const browsing = session !== undefined && canBrowseAllIndicators(session);
  const scheduling = session !== undefined && canSchedulePublication(session);
  const deciding = session !== undefined && canDecideUpdates(session);
  const listing = (!managing && !reviewing) || canCreate || browsing;
  const { page } = query.data;
  const { search } = searchQuery.data;

  if (!listing && page > 1) throw notFound();

  const api = context.get(apiContext);
  const [underReview, toReview, scheduled, awaitingDecision, list] = await Promise.all([
    managing
      ? api.get(
          listPath('/api/internal/indicators-under-review', { search }),
          indicatorsUnderReviewSchema,
        )
      : null,
    reviewing
      ? api
          .get(listPath('/api/internal/indicators-to-review', { search }), indicatorsToReviewSchema)
          .then(({ indicators }) => indicators)
      : null,
    scheduling
      ? api
          .get(
            listPath('/api/internal/indicators-scheduled', { search }),
            indicatorsScheduledSchema,
          )
          .then(({ indicators }) => indicators)
      : null,
    deciding
      ? api
          .get(
            listPath('/api/internal/updates-awaiting-decision', { search }),
            updatesAwaitingDecisionSchema,
          )
          .then(({ indicators }) => indicators)
      : null,
    listing ? loadIndicatorList(api, page, (managing || reviewing) && !browsing, search) : null,
  ]);

  return {
    search,
    underReview,
    toReview,
    scheduled,
    awaitingDecision,
    list: list === null ? null : { canCreate, ...list },
    // Taken after the fetches, so a failed page load does not consume the message it would show.
    notification: dashboardNotification(takeFlash(context)),
  };
}
