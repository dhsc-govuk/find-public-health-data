import { TEAM_IDS } from '@fphd/auth';
import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiAnswer,
  type FakeApiClient,
  fails,
} from '@fphd/web-server/testing';
import { describe, expect, it } from 'vitest';

import { flashCookie, loadWithFlash, withFlashStorage } from '../flash.testing.ts';
import { SIGNED_IN_USER_ID, signedInContext } from '../session.testing.ts';
import { indicatorDetail } from '../testing.ts';
import { loadIndicatorOverview } from './loader.ts';
import { ANSWERED_NOTES, UNANSWERED_NOTES } from './notes-for-reviewers.testing.ts';

const indicator = indicatorDetail({
  publishedSlug: 'life-expectancy-at-birth',
  indicatorStatus: 'live',
  draftStatus: null,
});
const DETAIL = `/api/internal/indicators/${indicator.id}` as const;

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

type Read = '/history' | '/notes-for-reviewers' | '/reviewer-notes';

/** Answers the indicator with `detail`, and its history and notes as `answers` says. */
function apiGet(detail: FakeApiAnswer, answers: Partial<Record<Read, FakeApiAnswer>> = {}) {
  const reads: Record<Read, FakeApiAnswer> = {
    '/history': history,
    '/notes-for-reviewers': UNANSWERED_NOTES,
    '/reviewer-notes': { notes: [] },
    ...answers,
  };
  return createFakeApiClient({
    [`GET ${DETAIL}`]: detail,
    ...Object.fromEntries(
      Object.entries(reads).map(([suffix, answer]) => [`GET ${DETAIL}${suffix}`, answer]),
    ),
  });
}

function notFound() {
  return fails(new Response('Not Found', { status: 404 }));
}

function paths(api: FakeApiClient) {
  return api.calls.map(({ path }) => path);
}

async function load(
  id: string,
  api: FakeApiClient,
  roles: readonly string[] = ['publisher'],
  teams: readonly string[] = [TEAM_IDS.teamA],
  cookie?: string,
  search = '',
) {
  const context = withFlashStorage(await signedInContext(roles, teams));
  context.set(apiContext, api);
  const request = new Request(`https://internal.test/dashboard/indicators/${id}${search}`, {
    ...(cookie === undefined ? {} : { headers: { Cookie: cookie } }),
  });

  return loadWithFlash(context, request, () =>
    loadIndicatorOverview({ context, params: { id }, request } as never),
  );
}

describe('loadIndicatorOverview', () => {
  it('fetches the indicator the address names, then its notes for reviewers and history', async () => {
    const notes = ANSWERED_NOTES;
    const api = apiGet(indicator, { '/notes-for-reviewers': notes });

    const outcome = await load(indicator.id, api);

    expect(paths(api)).toEqual([
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
    [
      'an assigned reviewer',
      ['imrg-reviewer'],
      [{ id: SIGNED_IN_USER_ID, name: 'Jamie Evans' }],
      true,
    ],
    [
      'a reviewer assigned to someone else',
      ['imrg-reviewer'],
      [{ id: '00000000-0000-7000-8000-0000000000a2', name: 'Robin' }],
      false,
    ],
    [
      'someone listed without the reviewer role',
      ['imrg-manager'],
      [{ id: SIGNED_IN_USER_ID, name: 'Avery' }],
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
      draftReviewers: [{ id: SIGNED_IN_USER_ID, name: 'Jamie Evans' }],
    };
    const notes = ANSWERED_NOTES;

    function notesGet(detail: FakeApiAnswer) {
      return apiGet(detail, { '/notes-for-reviewers': notes });
    }

    it.each([
      ['an IMRG manager', ['imrg-manager'], [], draft],
      ['an admin', ['admin'], [], draft],
      ['a publisher in its team', ['publisher'], [TEAM_IDS.teamA], draft],
      ['an assigned reviewer', ['imrg-reviewer'], [], draft],
      ['a publisher in its team, with no draft', ['publisher'], [TEAM_IDS.teamA], indicator],
      [
        'an IMRG manager, after a withdrawal',
        ['imrg-manager'],
        [],
        { ...draft, draftSubmissionStatus: 'withdrawn', draftReviewers: [] },
      ],
    ])('fetches them for %s', async (_who, roles, teams, detail) => {
      const api = notesGet(detail);

      const outcome = await load(indicator.id, api, roles, teams);

      expect(paths(api)).toContain(`${DETAIL}/notes-for-reviewers`);
      expect(outcome.notesForReviewers).toEqual(notes);
    });

    it('shows none to a reviewer unassigned after the indicator is read', async () => {
      const api = apiGet(draft, {
        '/notes-for-reviewers': notFound(),
        '/reviewer-notes': notFound(),
      });

      const outcome = await load(indicator.id, api, ['imrg-reviewer'], []);

      expect(outcome.notesForReviewers).toBeNull();
      expect(outcome.indicator).toEqual(draft);
    });

    it('lets any other failure of the notes fail the page', async () => {
      const failure = new Error('The API did not answer');
      const api = apiGet(draft, { '/notes-for-reviewers': fails(failure) });

      await expect(load(indicator.id, api, ['imrg-manager'], [])).rejects.toBe(failure);
    });

    it.each([
      ['a publisher in another team', ['publisher'], [TEAM_IDS.teamB], draft],
      ['a reviewer not assigned to it', ['imrg-reviewer'], [], { ...draft, draftReviewers: [] }],
    ])('does not fetch them for %s', async (_who, roles, teams, detail) => {
      const api = notesGet(detail);

      const outcome = await load(indicator.id, api, roles, teams);

      expect(api.calls).toHaveLength(1);
      expect(outcome.notesForReviewers).toBeNull();
    });
  });

  describe("the reviewers' notes", () => {
    const JAMIE = { id: SIGNED_IN_USER_ID, name: 'Jamie Evans' };
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
      detail: FakeApiAnswer,
      reviewerNotes: FakeApiAnswer = { notes: [robins, jamies] },
    ) {
      return apiGet(detail, { '/reviewer-notes': reviewerNotes });
    }

    it('fetches them for an assigned reviewer beside the notes for reviewers, theirs apart', async () => {
      const api = reviewerNotesGet(inReview);

      const outcome = await load(indicator.id, api, ['imrg-reviewer'], []);

      expect(paths(api)).toEqual([
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
      ['a publisher in its team', ['publisher'], [TEAM_IDS.teamA], inReview],
      ['a reviewer assigned to someone else', ['imrg-reviewer'], [], assignedToOthers],
      [
        'an admin, for a draft never submitted',
        ['admin'],
        [],
        { ...inReview, draftSubmissionStatus: null, draftReviewers: [] },
      ],
    ])('does not fetch them for %s', async (_who, roles, teams, detail) => {
      const api = reviewerNotesGet(detail);

      const outcome = await load(indicator.id, api, roles, teams);

      expect(paths(api)).not.toContain(notesPath);
      expect(outcome.reviewerNotes).toBeNull();
      expect(outcome.otherReviewerNotes).toEqual([]);
    });

    it('shows none to a reviewer unassigned after the indicator is read', async () => {
      const api = reviewerNotesGet(inReview, notFound());

      const outcome = await load(indicator.id, api, ['imrg-reviewer'], []);

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
      draftReviewers: [{ id: SIGNED_IN_USER_ID, name: 'Jamie Evans' }],
    };
    const historyPath = `/api/internal/indicators/${indicator.id}/history`;

    it.each([
      ['a publisher in its team', ['publisher'], [TEAM_IDS.teamA], draft],
      ['an IMRG manager', ['imrg-manager'], [], draft],
      ['an admin', ['admin'], [], draft],
      ['an assigned reviewer', ['imrg-reviewer'], [], draft],
      ['a publisher in its team, with no draft', ['publisher'], [TEAM_IDS.teamA], indicator],
    ])('fetches it for %s', async (_who, roles, teams, detail) => {
      const api = apiGet(detail);

      const outcome = await load(indicator.id, api, roles, teams);

      expect(paths(api)).toContain(historyPath);
      expect(outcome.history).toEqual(historyShown);
    });

    it.each([
      ['a publisher in another team', ['publisher'], [TEAM_IDS.teamB], draft],
      ['a reviewer not assigned to it', ['imrg-reviewer'], [], { ...draft, draftReviewers: [] }],
    ])('does not fetch it for %s', async (_who, roles, teams, detail) => {
      const api = apiGet(detail);

      const outcome = await load(indicator.id, api, roles, teams);

      expect(paths(api)).not.toContain(historyPath);
      expect(outcome.history).toBeNull();
    });

    it('shows none to a reviewer unassigned after the indicator is read', async () => {
      const api = apiGet(draft, { '/history': notFound() });

      const outcome = await load(indicator.id, api, ['imrg-reviewer'], []);

      expect(outcome.history).toBeNull();
      expect(outcome.indicator).toEqual(draft);
    });

    it('lets any other failure of the history fail the page', async () => {
      const failure = new Error('The API did not answer');
      const api = apiGet(draft, { '/history': fails(failure) });

      await expect(load(indicator.id, api, ['imrg-manager'], [])).rejects.toBe(failure);
    });
  });

  it('shows what the page before left to say', async () => {
    const outcome = await load(
      indicator.id,
      apiGet(indicator),
      ['publisher'],
      [TEAM_IDS.teamA],
      await flashCookie('draft-locked'),
    );

    expect(outcome.notification).toEqual({
      type: 'important',
      text: 'This indicator has been submitted for approval and cannot be edited.',
    });
  });

  it.each([
    ['new', 'Indicator successfully submitted for approval.'],
    ['live', 'Update successfully submitted for review.'],
  ] as const)('words the submission of a %s indicator: %s', async (indicatorStatus, text) => {
    const outcome = await load(
      indicator.id,
      apiGet({ ...indicator, indicatorStatus }),
      ['publisher'],
      [TEAM_IDS.teamA],
      await flashCookie('indicator-submitted'),
    );

    expect(outcome.notification).toEqual({ type: 'success', text });
  });

  it('shows nothing for a message it does not know', async () => {
    const outcome = await load(
      indicator.id,
      apiGet(indicator),
      ['publisher'],
      [TEAM_IDS.teamA],
      await flashCookie('constructor'),
    );

    expect(outcome.notification).toBeUndefined();
  });
});
