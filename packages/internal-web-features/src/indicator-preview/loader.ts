import { indicatorAdminDetailSchema } from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import type { LoaderFunctionArgs, RouterContextProvider } from 'react-router';

import { requireIndicatorId } from '../indicator-id.ts';
import { createPreviewApiClient } from './api-client.ts';
import { type PreviewLinks, previewLinks } from './links.ts';
import { PREVIEW_FROM_PARAM, type PreviewOpenedFrom } from './paths.ts';

/** What the preview's page knows of itself besides the public page's data. */
export interface IndicatorPreview {
  id: string;
  from: PreviewOpenedFrom;
}

/**
 * Sets the public page's settings for a request that runs its loaders as a preview: the page's
 * links and the detail schema. The app gives this, because only it may import the public page.
 */
export type SetPreviewPage = (
  context: Readonly<RouterContextProvider>,
  links: PreviewLinks,
) => void;

/**
 * Prepares a request to the preview of indicator `:id` for one of the public page's loaders. The
 * loaders then ask the preview API through a client that refuses any path it can't map, and read
 * the indicator by its short id, which the preview API resolves to the draft. An indicator with
 * no draft or scheduled version has no preview, so it is not found.
 */
export async function startIndicatorPreview(
  args: LoaderFunctionArgs,
  setPreviewPage: SetPreviewPage,
): Promise<{ args: LoaderFunctionArgs; preview: IndicatorPreview }> {
  const { context, params, request } = args;
  const id = requireIndicatorId(params);
  const api = context.get(apiContext);
  const indicator = await api.get(
    apiPath`/api/internal/indicators/${id}`,
    indicatorAdminDetailSchema,
  );
  if (indicator.draftStatus === null) throw new Response('Not Found', { status: 404 });

  context.set(apiContext, createPreviewApiClient(api, id));
  setPreviewPage(context, previewLinks(id));
  const from = new URL(request.url).searchParams.get(PREVIEW_FROM_PARAM);
  return {
    args: { ...args, params: { ...params, slug: String(indicator.shortId) } },
    preview: { id, from: from === 'task-list' ? 'task-list' : 'overview' },
  };
}
