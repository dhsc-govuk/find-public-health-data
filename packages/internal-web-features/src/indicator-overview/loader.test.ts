import { TEAM_IDS } from '@fphd/auth';
import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { describe, expect, it, vi } from 'vitest';

import { flashCookie, loadWithFlash, withFlashStorage } from '../flash.testing.ts';
import { signedInContext } from '../session.testing.ts';
import { loadIndicatorOverview } from './loader.ts';

const indicator = {
  id: '00000000-0000-7000-8000-000000000001',
  shortId: 90366,
  publishedSlug: 'life-expectancy-at-birth',
  name: 'Life expectancy at birth',
  teamId: TEAM_IDS.teamA,
  indicatorStatus: 'live',
  draftStatus: null,
  updatedAt: '2026-01-02T00:00:00.000Z',
};

async function load(
  id: string,
  get: ApiClient['get'],
  roles: readonly string[] = ['publisher'],
  teams: readonly string[] = [indicator.teamId],
  cookie?: string,
) {
  const context = withFlashStorage(await signedInContext(roles, teams));
  context.set(apiContext, { get } as unknown as ApiClient);
  const request = new Request(`https://internal.test/dashboard/indicators/${id}`, {
    ...(cookie === undefined ? {} : { headers: { Cookie: cookie } }),
  });

  return loadWithFlash(context, request, () =>
    loadIndicatorOverview({ context, params: { id }, request } as never),
  );
}

describe('loadIndicatorOverview', () => {
  it('fetches the indicator the address names', async () => {
    const get = vi.fn().mockResolvedValue(indicator);

    const outcome = await load(indicator.id, get);

    expect(get.mock.calls[0]?.[0]).toBe(`/api/internal/indicators/${indicator.id}`);
    expect(outcome).toEqual({
      canEdit: true,
      indicator,
      notesForReviewers: null,
      notification: undefined,
    });
  });

  it.each([
    ['an admin', ['admin'], []],
    ['a publisher in another team', ['publisher'], [TEAM_IDS.teamB]],
  ])('offers %s no editing action', async (_who, roles, teams) => {
    const outcome = await load(indicator.id, vi.fn().mockResolvedValue(indicator), roles, teams);

    expect(outcome.canEdit).toBe(false);
  });

  describe('the notes for reviewers', () => {
    const inReview = {
      ...indicator,
      publishedSlug: null,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftLocked: true,
      draftSubmissionStatus: 'in_review',
      draftReviewers: [{ id: 'test-user', name: 'Jamie Evans' }],
    };
    const unlocked = { ...inReview, draftLocked: false, draftReviewers: [] };
    const notes = {
      varianceAndQuality: { variation: 'Little.' },
      justifications: {},
      otherComments: {},
    };

    function apiGet(detail: object) {
      return vi
        .fn()
        .mockImplementation(async (path: string) =>
          path.endsWith('/notes-for-reviewers') ? notes : detail,
        );
    }

    it.each([
      ['an IMRG manager', ['imrg-manager'], []],
      ['an admin', ['admin'], []],
      // Locked while in review, so what its publisher reads is what they submitted.
      ['a publisher in its team', ['publisher'], [indicator.teamId]],
      ['an assigned reviewer', ['imrg-reviewer'], []],
      [
        'an IMRG manager, while the submission waits for reviewers',
        ['imrg-manager'],
        [],
        { ...inReview, draftSubmissionStatus: 'submitted', draftReviewers: [] },
      ],
    ])('fetches them for %s', async (_who, roles, teams, detail: object = inReview) => {
      const get = apiGet(detail);

      const outcome = await load(indicator.id, get, roles, teams);

      expect(get).toHaveBeenCalledWith(
        `/api/internal/indicators/${indicator.id}/notes-for-reviewers`,
        expect.anything(),
      );
      expect(outcome.notesForReviewers).toBe(notes);
    });

    it('shows none when the submission is withdrawn after the indicator is read', async () => {
      const get = vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith('/notes-for-reviewers')) {
          throw new Response('Not Found', { status: 404 });
        }
        return inReview;
      });

      const outcome = await load(indicator.id, get, ['imrg-manager'], []);

      expect(outcome.notesForReviewers).toBeNull();
      expect(outcome.indicator).toBe(inReview);
    });

    it('lets any other failure of the notes fail the page', async () => {
      const failure = new Error('The API did not answer');
      const get = vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith('/notes-for-reviewers')) throw failure;
        return inReview;
      });

      await expect(load(indicator.id, get, ['imrg-manager'], [])).rejects.toBe(failure);
    });

    it.each([
      ['a publisher in another team', ['publisher'], [TEAM_IDS.teamB], inReview],
      ['a reviewer not assigned to it', ['imrg-reviewer'], [], { ...inReview, draftReviewers: [] }],
      ['an IMRG manager, with no draft', ['imrg-manager'], [], indicator],
      [
        'an IMRG manager, before submission',
        ['imrg-manager'],
        [],
        { ...unlocked, draftSubmissionStatus: null },
      ],
      [
        'an IMRG manager, after a withdrawal',
        ['imrg-manager'],
        [],
        { ...unlocked, draftSubmissionStatus: 'withdrawn' },
      ],
    ])('does not fetch them for %s', async (_who, roles, teams, detail) => {
      const get = apiGet(detail);

      const outcome = await load(indicator.id, get, roles, teams);

      expect(get).toHaveBeenCalledTimes(1);
      expect(outcome.notesForReviewers).toBeNull();
    });
  });

  it('shows what the page before left to say', async () => {
    const outcome = await load(
      indicator.id,
      vi.fn().mockResolvedValue(indicator),
      ['publisher'],
      [indicator.teamId],
      await flashCookie('draft-locked'),
    );

    expect(outcome.notification).toEqual({
      type: 'important',
      text: 'This indicator has been submitted for approval and cannot be edited.',
    });
  });

  it('shows nothing for a message it does not know', async () => {
    const outcome = await load(
      indicator.id,
      vi.fn().mockResolvedValue(indicator),
      ['publisher'],
      [indicator.teamId],
      await flashCookie('constructor'),
    );

    expect(outcome.notification).toBeUndefined();
  });
});
