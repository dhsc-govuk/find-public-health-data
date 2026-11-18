import { topicAdminSummaryListSchema } from '@fphd/internal-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient } from '@fphd/web-server/testing';
import { type LoaderFunctionArgs, RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { indicatorDetail } from '../testing.ts';
import { startIndicatorPreview } from './loader.ts';

const indicator = indicatorDetail();
const OVERVIEW = `/api/internal/indicators/${indicator.id}` as const;

function args(api = createFakeApiClient({ [`GET ${OVERVIEW}`]: indicator }), query = '') {
  const context = new RouterContextProvider();
  context.set(apiContext, api);
  return {
    context,
    params: { id: indicator.id },
    request: new Request(`http://localhost/dashboard/indicators/${indicator.id}/preview${query}`),
  } as unknown as LoaderFunctionArgs;
}

describe('startIndicatorPreview', () => {
  it("runs the public loaders on the indicator's short id, asking the preview API", async () => {
    const api = createFakeApiClient({
      [`GET ${OVERVIEW}`]: indicator,
      [`GET ${OVERVIEW}/preview/api/indicators/90366`]: [],
    });
    const setPreviewPage = vi.fn();

    const started = await startIndicatorPreview(args(api), setPreviewPage);
    await started.args.context
      .get(apiContext)
      .get('/api/indicators/90366', topicAdminSummaryListSchema);

    expect(started.args.params.slug).toBe('90366');
    expect(api.calls.map(({ path }) => path)).toEqual([
      OVERVIEW,
      `${OVERVIEW}/preview/api/indicators/90366`,
    ]);
    expect(setPreviewPage).toHaveBeenCalledWith(
      started.args.context,
      expect.objectContaining({
        geographies: `/dashboard/indicators/${indicator.id}/preview/geographies`,
      }),
    );
  });

  it.each([
    ['', 'overview'],
    ['?from=task-list', 'task-list'],
    ['?from=elsewhere', 'overview'],
  ] as const)('goes back from %j to the %s', async (query, from) => {
    const { preview } = await startIndicatorPreview(args(undefined, query), vi.fn());

    expect(preview).toEqual({ id: indicator.id, from });
  });

  it('finds no preview of an indicator with no draft or scheduled version', async () => {
    const api = createFakeApiClient({
      [`GET ${OVERVIEW}`]: { ...indicator, draftStatus: null, indicatorStatus: 'live' },
    });

    await expect(startIndicatorPreview(args(api), vi.fn())).rejects.toMatchObject({ status: 404 });
  });

  it('finds no preview at an id that is not one, asking nothing', async () => {
    const api = createFakeApiClient();
    const loaderArgs = { ...args(api), params: { id: 'not-an-id' } };

    await expect(startIndicatorPreview(loaderArgs, vi.fn())).rejects.toMatchObject({
      status: 404,
    });
    expect(api.calls).toEqual([]);
  });
});
