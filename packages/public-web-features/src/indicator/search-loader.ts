import {
  indicatorListResponseSchema,
  MAX_INDICATOR_QUERY_LENGTH,
  queryText,
} from '@fphd/public-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs } from 'react-router';

/**
 * Resource route behind the add-indicator autocomplete: the browser asks its own origin,
 * and the server asks the API, keeping the API unreachable from the client as everywhere
 * else. No component — the loader's JSON is the whole response.
 */
export async function loadIndicatorSearch({ context, request }: LoaderFunctionArgs) {
  const query = queryText(new URL(request.url).searchParams.get('q'), MAX_INDICATOR_QUERY_LENGTH);
  if (!query) {
    return Response.json({ indicators: [] });
  }
  const api = context.get(apiContext);
  return Response.json(
    await api.get(`/api/indicators?q=${encodeURIComponent(query)}`, indicatorListResponseSchema),
  );
}
