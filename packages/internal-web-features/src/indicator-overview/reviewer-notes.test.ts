import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { describe, expect, it, vi } from 'vitest';

import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { signedInContext } from '../session.testing.ts';
import { NOTE_CHANGED, saveReviewerNote } from './reviewer-notes.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const NOTE_ID = '00000000-0000-7000-8000-0000000000e1';
const OVERVIEW = `/dashboard/indicators/${ID}`;
const VERSION = 'a'.repeat(64);
const CURRENT = 'b'.repeat(64);

function post(fields: Record<string, string>): Request {
  return new Request(`https://internal.test${OVERVIEW}`, {
    method: 'POST',
    body: new URLSearchParams(fields),
  });
}

async function save(
  client: Partial<ApiClient>,
  request: Request,
  roles: readonly string[] = ['imrg-reviewer'],
) {
  const context = withFlashStorage(await signedInContext(roles));
  context.set(apiContext, client as ApiClient);
  let outcome: unknown;
  const response = await flashedResponse(context, request, async () => {
    outcome = await saveReviewerNote({ context, params: { id: ID }, request } as never);
    return outcome;
  });
  return { outcome, response };
}

const notFound = () => Promise.reject(new Response('Not Found', { status: 404 }));

describe('saveReviewerNote', () => {
  it('adds a new note, trimmed, and returns to the Actions tab', async () => {
    const postToMember = vi.fn().mockResolvedValue({ ok: true, data: undefined });

    const { outcome } = await save({ postToMember }, post({ reviewerNote: '  Check 2019 \r\n' }));

    expect(postToMember).toHaveBeenCalledWith(
      `/api/internal/indicators/${ID}/reviewer-notes`,
      { text: 'Check 2019' },
      expect.anything(),
    );
    expect(outcome).toBeInstanceOf(Response);
    expect((outcome as Response).headers.get('Location')).toBe(`${OVERVIEW}#actions`);
  });

  it('saves the note the form edits against the version it showed', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, data: {} });

    const { outcome } = await save(
      { put },
      post({ reviewerNote: 'Settled', noteId: NOTE_ID, version: VERSION }),
    );

    expect(put).toHaveBeenCalledWith(
      `/api/internal/indicators/${ID}/reviewer-notes/${NOTE_ID}`,
      { text: 'Settled', version: VERSION },
      expect.anything(),
      expect.anything(),
    );
    expect((outcome as Response).headers.get('Location')).toBe(`${OVERVIEW}#actions`);
  });

  it('asks for notes before calling the API, keeping the form as it was', async () => {
    const put = vi.fn();
    const values = { reviewerNote: ' ', noteId: NOTE_ID, version: VERSION };

    const { outcome } = await save({ put }, post(values));

    expect(put).not.toHaveBeenCalled();
    expect(outcome).toEqual({ values, fieldErrors: { reviewerNote: 'Enter your notes' } });
  });

  it('keeps the text and takes the current version when the note has changed', async () => {
    const put = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      error: { error: 'changed', version: CURRENT },
    });

    const { outcome } = await save(
      { put },
      post({ reviewerNote: 'Mine', noteId: NOTE_ID, version: VERSION }),
    );

    expect(outcome).toEqual({
      values: { reviewerNote: 'Mine', noteId: NOTE_ID, version: CURRENT },
      fieldErrors: {},
      formError: NOTE_CHANGED,
    });
  });

  it("shows the API's field error on the field", async () => {
    const message = 'Notes must be 10,000 characters or fewer';
    const postToMember = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'validation_failed', fieldErrors: { text: message } },
    });

    const { outcome } = await save({ postToMember }, post({ reviewerNote: 'Fine here' }));

    expect(outcome).toMatchObject({ fieldErrors: { reviewerNote: message } });
  });

  it('explains a refusal that names no field', async () => {
    const put = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'invalid_request' },
    });

    const { outcome } = await save(
      { put },
      post({ reviewerNote: 'Mine', noteId: NOTE_ID, version: 'not-a-version' }),
    );

    expect(outcome).toMatchObject({ fieldErrors: {}, formError: FORM_NOT_SAVED });
  });

  it.each([
    ['a 404 from adding', { postToMember: notFound }, {}],
    ['a 404 from editing', { put: notFound }, { noteId: NOTE_ID, version: VERSION }],
    [
      'a reviewer unassigned since the check',
      {
        postToMember: async () => ({
          ok: false as const,
          status: 409,
          error: { error: 'not_a_reviewer' as const },
        }),
      },
      {},
    ],
  ])('sends a reviewer no longer assigned to the dashboard, on %s', async (_, client, fields) => {
    const { response } = await save(
      client as Partial<ApiClient>,
      post({ reviewerNote: 'Too late', ...fields }),
    );

    expect(await redirectWithFlash(response)).toEqual({
      status: 302,
      location: '/dashboard',
      flash: 'no-longer-reviewer',
    });
  });

  it('lets any other failure of the API fall to the error page', async () => {
    const forbidden = new Response('Bad Gateway', { status: 502 });

    const { response } = await save(
      { postToMember: () => Promise.reject(forbidden) },
      post({ reviewerNote: 'Mine' }),
    );

    expect(response).toBe(forbidden);
  });

  it.each([['publisher'], ['imrg-manager'], ['admin']])(
    'answers 404 to a %s without the reviewer role',
    async (role) => {
      const { response } = await save({}, post({ reviewerNote: 'Mine' }), [role]);

      expect(response.status).toBe(404);
    },
  );
});
