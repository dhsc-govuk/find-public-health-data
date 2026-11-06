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
  draftSubmissionStatus: null,
  draftReviewers: [],
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const history = {
  entries: [{ kind: 'created', at: '2026-01-02T00:00:00.000Z', by: 'Sam Taylor' }],
};
const historyShown = [
  {
    date: '2026-01-02T00:00:00.000Z',
    action: 'Indicator first created',
    by: 'Sam Taylor',
    rows: [],
  },
];

/** Answers the history and the notes as `answers` says, and anything else with `detail`. */
function apiGet(detail: object, answers: Readonly<Record<string, () => Promise<unknown>>> = {}) {
  const reads: Record<string, () => Promise<unknown>> = {
    '/history': async () => history,
    '/notes-for-reviewers': async () => ({}),
    '/reviewer-notes': async () => ({ notes: [] }),
    ...answers,
  };
  return vi.fn().mockImplementation(async (path: string) => {
    const read = Object.entries(reads).find(([suffix]) => path.endsWith(suffix));
    return read === undefined ? detail : read[1]();
  });
}

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
  it('fetches the indicator the address names, then its notes for reviewers and history', async () => {
    const notes = { varianceAndQuality: {}, justifications: {}, otherComments: {} };
    const get = apiGet(indicator, { '/notes-for-reviewers': async () => notes });

    const outcome = await load(indicator.id, get);

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      `/api/internal/indicators/${indicator.id}`,
      `/api/internal/indicators/${indicator.id}/notes-for-reviewers`,
      `/api/internal/indicators/${indicator.id}/history`,
    ]);
    expect(outcome).toEqual({
      canEdit: true,
      isReviewer: false,
      indicator,
      notesForReviewers: notes,
      reviewerNotes: null,
      otherReviewerNotes: [],
      history: historyShown,
      notification: undefined,
    });
  });

  it.each([
    ['an admin', ['admin'], []],
    ['a publisher in another team', ['publisher'], [TEAM_IDS.teamB]],
  ])('offers %s no editing action', async (_who, roles, teams) => {
    const outcome = await load(indicator.id, apiGet(indicator), roles, teams);

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

    const outcome = await load(indicator.id, apiGet(detail), roles, []);

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

    function notesGet(detail: object) {
      return apiGet(detail, { '/notes-for-reviewers': async () => notes });
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
      const get = notesGet(detail);

      const outcome = await load(indicator.id, get, roles, teams);

      expect(get).toHaveBeenCalledWith(
        `/api/internal/indicators/${indicator.id}/notes-for-reviewers`,
        expect.anything(),
      );
      expect(outcome.notesForReviewers).toBe(notes);
    });

    it('shows none to a reviewer unassigned after the indicator is read', async () => {
      const notFound = async () => {
        throw new Response('Not Found', { status: 404 });
      };
      const get = apiGet(draft, { '/notes-for-reviewers': notFound, '/reviewer-notes': notFound });

      const outcome = await load(indicator.id, get, ['imrg-reviewer'], []);

      expect(outcome.notesForReviewers).toBeNull();
      expect(outcome.indicator).toBe(draft);
    });

    it('lets any other failure of the notes fail the page', async () => {
      const failure = new Error('The API did not answer');
      const get = apiGet(draft, {
        '/notes-for-reviewers': async () => {
          throw failure;
        },
      });

      await expect(load(indicator.id, get, ['imrg-manager'], [])).rejects.toBe(failure);
    });

    it.each([
      ['a publisher in another team', ['publisher'], [TEAM_IDS.teamB], draft],
      ['a reviewer not assigned to it', ['imrg-reviewer'], [], { ...draft, draftReviewers: [] }],
    ])('does not fetch them for %s', async (_who, roles, teams, detail) => {
      const get = notesGet(detail);

      const outcome = await load(indicator.id, get, roles, teams);

      expect(get).toHaveBeenCalledTimes(1);
      expect(outcome.notesForReviewers).toBeNull();
    });
  });

  describe("the reviewers' notes", () => {
    const JAMIE = { id: 'test-user', name: 'Jamie Evans' };
    const ROBIN = { id: '00000000-0000-7000-8000-0000000000a2', name: 'Robin Shaw' };
    const inReview = {
      ...indicator,
      publishedSlug: null,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftSubmissionStatus: 'in_review',
      draftReviewers: [JAMIE, ROBIN],
    };
    const assignedToOthers = { ...inReview, draftReviewers: [ROBIN] };
    const note = (id: string, text: string, author: typeof JAMIE) => ({
      id,
      text,
      createdAt: '2026-11-03T10:15:00.000Z',
      updatedAt: '2026-11-03T10:15:00.000Z',
      version: 'a'.repeat(64),
      author,
    });
    const jamies = note('00000000-0000-7000-8000-0000000000e1', 'Check the 2019 dip', JAMIE);
    const robins = note('00000000-0000-7000-8000-0000000000e2', 'Numerator checked', ROBIN);
    const notesPath = `/api/internal/indicators/${indicator.id}/reviewer-notes`;

    function reviewerNotesGet(
      detail: object,
      notesGet: () => Promise<unknown> = async () => ({ notes: [robins, jamies] }),
    ) {
      return apiGet(detail, { '/reviewer-notes': notesGet });
    }

    it('fetches them for an assigned reviewer beside the notes for reviewers, theirs apart', async () => {
      const get = reviewerNotesGet(inReview);

      const outcome = await load(indicator.id, get, ['imrg-reviewer'], []);

      expect(get.mock.calls.map(([path]) => path)).toEqual([
        `/api/internal/indicators/${indicator.id}`,
        `/api/internal/indicators/${indicator.id}/notes-for-reviewers`,
        notesPath,
        `/api/internal/indicators/${indicator.id}/history`,
      ]);
      expect(outcome.reviewerNotes).toEqual({
        notes: [jamies],
        form: { values: { reviewerNote: '', noteId: '', version: '' }, fieldErrors: {} },
      });
      expect(outcome.otherReviewerNotes).toEqual([{ author: ROBIN, notes: [robins] }]);
    });

    it.each([
      ['an IMRG manager', ['imrg-manager']],
      ['an admin', ['admin']],
    ])("gives %s every reviewer's notes read only", async (_who, roles) => {
      const outcome = await load(indicator.id, reviewerNotesGet(inReview), roles, []);

      expect(outcome.reviewerNotes).toBeNull();
      expect(outcome.otherReviewerNotes).toEqual([
        { author: JAMIE, notes: [jamies] },
        { author: ROBIN, notes: [robins] },
      ]);
    });

    it('fills the form with the note the address names', async () => {
      const outcome = await load(
        indicator.id,
        reviewerNotesGet(inReview),
        ['imrg-reviewer'],
        [],
        undefined,
        `?note=${jamies.id}`,
      );

      expect(outcome.reviewerNotes?.form.values).toEqual({
        reviewerNote: 'Check the 2019 dip',
        noteId: jamies.id,
        version: jamies.version,
      });
    });

    it.each([
      ['another reviewer', robins.id],
      ['nobody', '00000000-0000-7000-8000-0000000000ff'],
    ])('leaves the form empty for a note by %s', async (_who, noteId) => {
      const outcome = await load(
        indicator.id,
        reviewerNotesGet(inReview),
        ['imrg-reviewer'],
        [],
        undefined,
        `?note=${noteId}`,
      );

      expect(outcome.reviewerNotes?.form.values.noteId).toBe('');
    });

    it.each([
      ['a publisher in its team', ['publisher'], [indicator.teamId], inReview],
      ['a reviewer assigned to someone else', ['imrg-reviewer'], [], assignedToOthers],
      [
        'an admin, for a draft never submitted',
        ['admin'],
        [],
        { ...inReview, draftSubmissionStatus: null, draftReviewers: [] },
      ],
    ])('does not fetch them for %s', async (_who, roles, teams, detail) => {
      const get = reviewerNotesGet(detail);

      const outcome = await load(indicator.id, get, roles, teams);

      expect(get).not.toHaveBeenCalledWith(notesPath, expect.anything());
      expect(outcome.reviewerNotes).toBeNull();
      expect(outcome.otherReviewerNotes).toEqual([]);
    });

    it('shows none to a reviewer unassigned after the indicator is read', async () => {
      const get = reviewerNotesGet(inReview, async () => {
        throw new Response('Not Found', { status: 404 });
      });

      const outcome = await load(indicator.id, get, ['imrg-reviewer'], []);

      expect(outcome.reviewerNotes).toBeNull();
      expect(outcome.otherReviewerNotes).toEqual([]);
    });
  });

  describe('the history', () => {
    const draft = {
      ...indicator,
      publishedSlug: null,
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftReviewers: [{ id: 'test-user', name: 'Jamie Evans' }],
    };
    const historyPath = `/api/internal/indicators/${indicator.id}/history`;

    it.each([
      ['a publisher in its team', ['publisher'], [indicator.teamId], draft],
      ['an IMRG manager', ['imrg-manager'], [], draft],
      ['an admin', ['admin'], [], draft],
      ['an assigned reviewer', ['imrg-reviewer'], [], draft],
      ['a publisher in its team, with no draft', ['publisher'], [indicator.teamId], indicator],
    ])('fetches it for %s', async (_who, roles, teams, detail) => {
      const get = apiGet(detail);

      const outcome = await load(indicator.id, get, roles, teams);

      expect(get).toHaveBeenCalledWith(historyPath, expect.anything());
      expect(outcome.history).toEqual(historyShown);
    });

    it.each([
      ['a publisher in another team', ['publisher'], [TEAM_IDS.teamB], draft],
      ['a reviewer not assigned to it', ['imrg-reviewer'], [], { ...draft, draftReviewers: [] }],
    ])('does not fetch it for %s', async (_who, roles, teams, detail) => {
      const get = apiGet(detail);

      const outcome = await load(indicator.id, get, roles, teams);

      expect(get).not.toHaveBeenCalledWith(historyPath, expect.anything());
      expect(outcome.history).toBeNull();
    });

    it('shows none to a reviewer unassigned after the indicator is read', async () => {
      const get = apiGet(draft, {
        '/history': async () => {
          throw new Response('Not Found', { status: 404 });
        },
      });

      const outcome = await load(indicator.id, get, ['imrg-reviewer'], []);

      expect(outcome.history).toBeNull();
      expect(outcome.indicator).toBe(draft);
    });

    it('lets any other failure of the history fail the page', async () => {
      const failure = new Error('The API did not answer');
      const get = apiGet(draft, {
        '/history': async () => {
          throw failure;
        },
      });

      await expect(load(indicator.id, get, ['imrg-manager'], [])).rejects.toBe(failure);
    });
  });

  it('shows what the page before left to say', async () => {
    const outcome = await load(
      indicator.id,
      apiGet(indicator),
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
      apiGet(indicator),
      ['publisher'],
      [indicator.teamId],
      await flashCookie('constructor'),
    );

    expect(outcome.notification).toBeUndefined();
  });
});
