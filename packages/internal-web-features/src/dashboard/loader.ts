// No @fphd/ui imports here, so the loader unit-tests without the jsdom the components need.
import {
  canAssignReviewers,
  canCreateIndicator,
  canReviewIndicators,
} from '@fphd/auth/permissions';
import {
  indicatorAdminPageSchema,
  indicatorPageQuerySchema,
  indicatorsToReviewSchema,
  indicatorsUnderReviewSchema,
} from '@fphd/internal-api-features/contract';
import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { getSession } from '@fphd/web-server/session';
import type { LoaderFunctionArgs } from 'react-router';

import { queryObject } from '../query-object.ts';

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
 * An IMRG manager sees the indicators under review, an IMRG reviewer those assigned to them, and
 * anyone else a page of the indicators they work on. A manager or reviewer who also publishes
 * sees both. A page that cannot exist is a 404, like any other address that names nothing.
 */
export async function loadDashboard({ context, request }: LoaderFunctionArgs) {
  const query = indicatorPageQuerySchema.safeParse(queryObject(new URL(request.url).searchParams));

  if (!query.success) throw notFound();

  const session = getSession(context);
  const managing = session !== undefined && canAssignReviewers(session);
  const reviewing = !managing && session !== undefined && canReviewIndicators(session);
  const canCreate = session !== undefined && canCreateIndicator(session);
  const listing = (!managing && !reviewing) || canCreate;
  const { page } = query.data;

  if (!listing && page > 1) throw notFound();

  const api = context.get(apiContext);
  const [underReview, toReview, list] = await Promise.all([
    managing ? api.get('/api/internal/indicators-under-review', indicatorsUnderReviewSchema) : null,
    reviewing
      ? api
          .get('/api/internal/indicators-to-review', indicatorsToReviewSchema)
          .then(({ indicators }) => indicators)
      : null,
    listing ? loadIndicatorList(api, page, managing || reviewing) : null,
  ]);

  return {
    underReview,
    toReview,
    list: list === null ? null : { canCreate, ...list },
  };
}
