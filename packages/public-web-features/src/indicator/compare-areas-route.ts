import {
  areaDisplayGroupListSchema,
  areaNeighbourListSchema,
  MAX_NEIGHBOUR_AREAS_PER_REQUEST,
  pickAreaCodes,
} from '@fphd/public-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs } from 'react-router';

import { AREA_COMPARISON_PARENT_TYPES } from './area-comparison.ts';
import { isIndicatorSegment } from './paths.ts';

/**
 * The compare areas tab's regions (`parents`) and the statistical neighbours of the given
 * `areaCode`s, which the tab fetches once it is shown so other tabs never load them.
 */
export async function loader({ context, request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const api = context.get(apiContext);
  const indicator = url.searchParams.get('indicator') ?? '';
  const displayGroup = url.searchParams.get('displayGroup') ?? '';
  const parentType =
    url.searchParams.get('parents') === '1'
      ? AREA_COMPARISON_PARENT_TYPES[displayGroup]
      : undefined;
  const codes = pickAreaCodes(url.searchParams.getAll('areaCode'), MAX_NEIGHBOUR_AREAS_PER_REQUEST);
  if (parentType && !isIndicatorSegment(indicator)) {
    return new Response('Not Found', { status: 404 });
  }
  const [groups, neighbours] = await Promise.allSettled([
    parentType
      ? api.get(
          `${apiPath`/api/indicators/${indicator}/areas`}?displayGroup=${encodeURIComponent(displayGroup)}&parentType=${encodeURIComponent(parentType)}`,
          areaDisplayGroupListSchema,
        )
      : undefined,
    codes.length
      ? api.get(
          `/api/areas/neighbours?${codes.map((code) => `areaCode=${encodeURIComponent(code)}`).join('&')}`,
          areaNeighbourListSchema,
        )
      : [],
  ]);
  return Response.json({
    parents:
      (groups.status === 'fulfilled' ? groups.value : undefined)?.flatMap(({ areas }) =>
        areas.map(({ code, parent }) => ({ code, parent: parent ?? null })),
      ) ?? null,
    neighbours: neighbours.status === 'fulfilled' ? neighbours.value : null,
  });
}
