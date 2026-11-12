import { apiContext } from '@fphd/web-server/api-context';
import {
  createFakeApiClient,
  type FakeApiClient,
  type FakeApiStubs,
  fails,
  noContent,
  refused,
} from '@fphd/web-server/testing';
import { describe, expect, it } from 'vitest';

import { flashedResponse, redirectWithFlash, withFlashStorage } from '../flash.testing.ts';
import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { signedInContext } from '../session.testing.ts';
import { NOTE_CHANGED, saveReviewerNote } from './reviewer-note-form.ts';

const ID = '00000000-0000-7000-8000-000000000001';
const NOTE_ID = '00000000-0000-7000-8000-0000000000e1';
const OVERVIEW = `/dashboard/indicators/${ID}`;
const VERSION = 'a'.repeat(64);
const CURRENT = 'b'.repeat(64);
const ADD = `POST /api/internal/indicators/${ID}/reviewer-notes` as const;
const EDIT = `PUT /api/internal/indicators/${ID}/reviewer-notes/${NOTE_ID}` as const;

function post(fields: Record<string, string>): Request {
  return new Request(`https://internal.test${OVERVIEW}`, {
    method: 'POST',
    body: new URLSearchParams(fields),
  });
}

async function save(
  api: FakeApiClient,
  request: Request,
  roles: readonly string[] = ['imrg-reviewer'],
) {
  const context = withFlashStorage(await signedInContext(roles));
  context.set(apiContext, api);
  let outcome: unknown;
  const response = await flashedResponse(context, request, async () => {
    outcome = await saveReviewerNote({ context, params: { id: ID }, request } as never);
    return outcome;
  });
  return { outcome, response };
}

const notFound = () => fails(new Response('Not Found', { status: 404 }));

describe('saveReviewerNote', () => {
  it('adds a new note, trimmed, and returns to the Actions tab', async () => {
    const api = createFakeApiClient({ [ADD]: noContent });

    const { outcome } = await save(api, post({ reviewerNote: '  Check 2019 \r\n' }));

    expect(api.calls[0]?.body).toEqual({ text: 'Check 2019' });
    expect(outcome).toBeInstanceOf(Response);
    expect((outcome as Response).headers.get('Location')).toBe(`${OVERVIEW}#actions`);
  });

  it('saves the note the form edits against the version it showed', async () => {
    const api = createFakeApiClient({
      [EDIT]: {
        id: NOTE_ID,
        text: 'Settled',
        createdAt: '2026-11-03T10:15:00.000Z',
        updatedAt: '2026-11-04T09:00:00.000Z',
        version: CURRENT,
      },
    });

    const { outcome } = await save(
      api,
      post({ reviewerNote: 'Settled', noteId: NOTE_ID, version: VERSION }),
    );

    expect(api.calls[0]?.body).toEqual({ text: 'Settled', version: VERSION });
    expect((outcome as Response).headers.get('Location')).toBe(`${OVERVIEW}#actions`);
  });

  it('asks for notes before calling the API, keeping the form as it was', async () => {
    const api = createFakeApiClient();
    const values = { reviewerNote: ' ', noteId: NOTE_ID, version: VERSION };

    const { outcome } = await save(api, post(values));

    expect(api.calls).toEqual([]);
    expect(outcome).toEqual({ values, fieldErrors: { reviewerNote: 'Enter your notes' } });
  });

  it('keeps the text and takes the current version when the note has changed', async () => {
    const api = createFakeApiClient({
      [EDIT]: refused(409, { error: 'changed', version: CURRENT }),
    });

    const { outcome } = await save(
      api,
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
    const api = createFakeApiClient({
      [ADD]: refused(400, { error: 'validation_failed', fieldErrors: { text: message } }),
    });

    const { outcome } = await save(api, post({ reviewerNote: 'Fine here' }));

    expect(outcome).toMatchObject({ fieldErrors: { reviewerNote: message } });
  });

  it('explains a refusal that names no field', async () => {
    const api = createFakeApiClient({ [EDIT]: refused(400, { error: 'invalid_request' }) });

    const { outcome } = await save(
      api,
      post({ reviewerNote: 'Mine', noteId: NOTE_ID, version: 'not-a-version' }),
    );

    expect(outcome).toMatchObject({ fieldErrors: {}, formError: FORM_NOT_SAVED });
  });

  it.each<[string, FakeApiStubs, Record<string, string>]>([
    ['a 404 from adding', { [ADD]: notFound() }, {}],
    ['a 404 from editing', { [EDIT]: notFound() }, { noteId: NOTE_ID, version: VERSION }],
    [
      'a reviewer unassigned since the check',
      { [ADD]: refused(409, { error: 'not_a_reviewer' }) },
      {},
    ],
  ])('sends a reviewer no longer assigned to the dashboard, on %s', async (_, stubs, fields) => {
    const { response } = await save(
      createFakeApiClient(stubs),
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
      createFakeApiClient({ [ADD]: fails(forbidden) }),
      post({ reviewerNote: 'Mine' }),
    );

    expect(response).toBe(forbidden);
  });

  it.each([['publisher'], ['imrg-manager'], ['admin']])(
    'answers 404 to a %s without the reviewer role',
    async (role) => {
      const { response } = await save(createFakeApiClient(), post({ reviewerNote: 'Mine' }), [
        role,
      ]);

      expect(response.status).toBe(404);
    },
  );
});
