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
  draftReviewers: [],
  updatedAt: '2026-01-02T00:00:00.000Z',
};

async function load(
  id: string,
  get: ApiClient['get'],
  roles: readonly string[] = ['publisher'],
  teams: readonly string[] = [indicator.teamId],
  cookie?: string,
  search = '',
) {
  const context = withFlashStorage(await signedInContext(roles, teams));
  context.set(apiContext, { get } as unknown as ApiClient);
  const request = new Request(`https://internal.test/dashboard/indicators/${id}${search}`, {
    ...(cookie === undefined ? {} : { headers: { Cookie: cookie } }),
  });

  return loadWithFlash(context, request, () =>
    loadIndicatorOverview({ context, params: { id }, request } as never),
  );
}

describe('loadIndicatorOverview', () => {
  it('fetches the indicator the address names, then its notes for reviewers', async () => {
    const notes = { varianceAndQuality: {}, justifications: {}, otherComments: {} };
    const get = vi
      .fn()
      .mockImplementation(async (path: string) =>
        path.endsWith('/notes-for-reviewers') ? notes : indicator,
      );

    const outcome = await load(indicator.id, get);

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      `/api/internal/indicators/${indicator.id}`,
      `/api/internal/indicators/${indicator.id}/notes-for-reviewers`,
    ]);
    expect(outcome).toEqual({
      canEdit: true,
      isReviewer: false,
      indicator,
      notesForReviewers: notes,
      reviewerNotes: null,
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

  it.each([
    ['an assigned reviewer', ['imrg-reviewer'], [{ id: 'test-user', name: 'Jamie Evans' }], true],
    [
      'a reviewer assigned to someone else',
      ['imrg-reviewer'],
      [{ id: 'other', name: 'Robin' }],
      false,
    ],
    [
      'someone listed without the reviewer role',
      ['imrg-manager'],
      [{ id: 'test-user', name: 'Avery' }],
      false,
    ],
  ])('says whether the user is %s of it', async (_who, roles, draftReviewers, expected) => {
    const detail = { ...indicator, draftStatus: 'draft', draftReviewers };
    const get = vi.fn().mockImplementation(async (path: string) => {
      if (path.endsWith('/reviewer-notes')) return { notes: [] };
      return path.endsWith('/notes-for-reviewers') ? {} : detail;
    });

    const outcome = await load(indicator.id, get, roles, []);

    expect(outcome.isReviewer).toBe(expected);
  });

  describe('the notes for reviewers', () => {
    const draft = {
      ...indicator,
      publishedSlug: null,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftReviewers: [{ id: 'test-user', name: 'Jamie Evans' }],
    };
    const notes = {
      varianceAndQuality: { variation: 'Little.' },
      justifications: {},
      otherComments: {},
    };

    function apiGet(detail: object) {
      return vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith('/reviewer-notes')) return { notes: [] };
        return path.endsWith('/notes-for-reviewers') ? notes : detail;
      });
    }

    it.each([
      ['an IMRG manager', ['imrg-manager'], [], draft],
      ['an admin', ['admin'], [], draft],
      ['a publisher in its team', ['publisher'], [indicator.teamId], draft],
      ['an assigned reviewer', ['imrg-reviewer'], [], draft],
      ['a publisher in its team, with no draft', ['publisher'], [indicator.teamId], indicator],
      [
        'an IMRG manager, after a withdrawal',
        ['imrg-manager'],
        [],
        { ...draft, draftSubmissionStatus: 'withdrawn', draftReviewers: [] },
      ],
    ])('fetches them for %s', async (_who, roles, teams, detail) => {
      const get = apiGet(detail);

      const outcome = await load(indicator.id, get, roles, teams);

      expect(get).toHaveBeenCalledWith(
        `/api/internal/indicators/${indicator.id}/notes-for-reviewers`,
        expect.anything(),
      );
      expect(outcome.notesForReviewers).toBe(notes);
    });

    it('shows none to a reviewer unassigned after the indicator is read', async () => {
      const get = vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith('/notes-for-reviewers') || path.endsWith('/reviewer-notes')) {
          throw new Response('Not Found', { status: 404 });
        }
        return draft;
      });

      const outcome = await load(indicator.id, get, ['imrg-reviewer'], []);

      expect(outcome.notesForReviewers).toBeNull();
      expect(outcome.indicator).toBe(draft);
    });

    it('lets any other failure of the notes fail the page', async () => {
      const failure = new Error('The API did not answer');
      const get = vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith('/notes-for-reviewers')) throw failure;
        return draft;
      });

      await expect(load(indicator.id, get, ['imrg-manager'], [])).rejects.toBe(failure);
    });

    it.each([
      ['a publisher in another team', ['publisher'], [TEAM_IDS.teamB], draft],
      ['a reviewer not assigned to it', ['imrg-reviewer'], [], { ...draft, draftReviewers: [] }],
    ])('does not fetch them for %s', async (_who, roles, teams, detail) => {
      const get = apiGet(detail);

      const outcome = await load(indicator.id, get, roles, teams);

      expect(get).toHaveBeenCalledTimes(1);
      expect(outcome.notesForReviewers).toBeNull();
    });
  });

  describe("the reviewer's own notes", () => {
    const inReview = {
      ...indicator,
      publishedSlug: null,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftReviewers: [{ id: 'test-user', name: 'Jamie Evans' }],
    };
    const reviewerNotes = [
      {
        id: '00000000-0000-7000-8000-0000000000e1',
        text: 'Check the 2019 dip',
        createdAt: '2026-11-03T10:15:00.000Z',
        updatedAt: '2026-11-03T10:15:00.000Z',
        version: 'a'.repeat(64),
      },
    ];

    function apiGet(
      detail: object,
      notesGet: () => Promise<unknown> = async () => ({ notes: reviewerNotes }),
    ) {
      return vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith('/reviewer-notes')) return notesGet();
        if (path.endsWith('/notes-for-reviewers')) return {};
        return detail;
      });
    }

    it('fetches them for an assigned reviewer beside the notes for reviewers', async () => {
      const get = apiGet(inReview);

      const outcome = await load(indicator.id, get, ['imrg-reviewer'], []);

      expect(get.mock.calls.map(([path]) => path)).toEqual([
        `/api/internal/indicators/${indicator.id}`,
        `/api/internal/indicators/${indicator.id}/notes-for-reviewers`,
        `/api/internal/indicators/${indicator.id}/reviewer-notes`,
      ]);
      expect(outcome.reviewerNotes).toEqual({
        notes: reviewerNotes,
        form: { values: { reviewerNote: '', noteId: '', version: '' }, fieldErrors: {} },
      });
    });

    it('fills the form with the note the address names', async () => {
      const [note] = reviewerNotes;
      const outcome = await load(
        indicator.id,
        apiGet(inReview),
        ['imrg-reviewer'],
        [],
        undefined,
        `?note=${note?.id}`,
      );

      expect(outcome.reviewerNotes?.form.values).toEqual({
        reviewerNote: 'Check the 2019 dip',
        noteId: note?.id,
        version: note?.version,
      });
    });

    it('leaves the form empty for a note that is not one of theirs', async () => {
      const outcome = await load(
        indicator.id,
        apiGet(inReview),
        ['imrg-reviewer'],
        [],
        undefined,
        '?note=00000000-0000-7000-8000-0000000000ff',
      );

      expect(outcome.reviewerNotes?.form.values.noteId).toBe('');
    });

    it.each([
      ['an IMRG manager', ['imrg-manager'], [], inReview],
      ['an admin', ['admin'], [], inReview],
      ['a publisher in its team', ['publisher'], [indicator.teamId], inReview],
      [
        'a reviewer assigned to someone else',
        ['imrg-reviewer'],
        [],
        { ...inReview, draftReviewers: [{ id: 'other', name: 'Robin Shaw' }] },
      ],
    ])('does not fetch them for %s', async (_who, roles, teams, detail) => {
      const get = apiGet(detail);

      const outcome = await load(indicator.id, get, roles, teams);

      expect(get).not.toHaveBeenCalledWith(
        `/api/internal/indicators/${indicator.id}/reviewer-notes`,
        expect.anything(),
      );
      expect(outcome.reviewerNotes).toBeNull();
    });

    it('shows none to a reviewer unassigned after the indicator is read', async () => {
      const get = apiGet(inReview, async () => {
        throw new Response('Not Found', { status: 404 });
      });

      const outcome = await load(indicator.id, get, ['imrg-reviewer'], []);

      expect(outcome.reviewerNotes).toBeNull();
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
