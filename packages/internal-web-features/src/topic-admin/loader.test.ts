import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import {
  createFlashSessionStorage,
  flashMiddleware,
  setFlashStorage,
} from '@fphd/web-server/flash';
import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { SHOWN_VERSION } from '../testing.ts';
import {
  createTopic,
  deleteTopic,
  loadAdminTopics,
  loadAdminTopicToDelete,
  loadAdminTopicToEdit,
  saveTopic,
  TOPIC_CHANGED,
} from './loader.ts';
import { deleteTopicPath, editTopicPath, TOPICS_ADMIN_PATH } from './paths.ts';

const flashStorage = createFlashSessionStorage({
  audience: 'internal',
  secret: 'a-web-session-secret-that-is-long-enough-for-tests',
  secure: false,
});

const topic = {
  id: '00000000-0000-7000-8000-000000000001',
  slug: 'air-quality',
  title: 'Air quality',
  description: 'About air quality.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  version: SHOWN_VERSION,
};

const valid = { title: 'Air quality', slug: 'air-quality', description: 'About air quality.' };

function fakeApi(overrides: Partial<Record<keyof ApiClient, unknown>> = {}): ApiClient {
  return {
    get: () => Promise.reject(new Error('get was not stubbed for this test')),
    put: () => Promise.reject(new Error('put was not stubbed for this test')),
    post: () => Promise.reject(new Error('post was not stubbed for this test')),
    delete: () => Promise.reject(new Error('delete was not stubbed for this test')),
    ...overrides,
  } as unknown as ApiClient;
}

function createContext(api: ApiClient): RouterContextProvider {
  const context = new RouterContextProvider();
  context.set(apiContext, api);
  setFlashStorage(context, flashStorage);
  return context;
}

interface RunOptions {
  context: RouterContextProvider;
  cookie?: string;
  method?: 'GET' | 'POST';
  body?: Record<string, string>;
  params?: Record<string, string>;
}

/**
 * Loaders and the action are run through the flash middleware here because they are in the
 * app: the flash they read and write only exists inside it, and a message becomes a
 * `Set-Cookie` only because the middleware commits it onto the response.
 */
async function run<T>(
  handler: (args: never) => Promise<T>,
  { context, cookie, method = 'GET', body, params = {} }: RunOptions,
): Promise<{ outcome: T; response: Response }> {
  const request = new Request(`https://internal.test${editTopicPath(topic.id)}`, {
    method,
    ...(body === undefined ? {} : { body: new URLSearchParams(body) }),
    ...(cookie === undefined ? {} : { headers: { Cookie: cookie } }),
  });
  const args = { context, params, pattern: '/', request, url: new URL(request.url) };

  let outcome: T | undefined;
  let produced = false;

  const response = await flashMiddleware(args as never, async () => {
    outcome = await handler(args as never);
    produced = true;
    return outcome instanceof Response ? outcome : new Response('rendered');
  });

  if (!produced) throw new Error('The handler produced nothing');
  if (!(response instanceof Response)) throw new Error('The middleware returned no response');

  return { outcome: outcome as T, response };
}

/** The cookie the browser would send back after a response set one. */
function cookieFrom(response: Response): string {
  return response.headers.getSetCookie().at(-1)?.split(';', 1)[0] ?? '';
}

describe('loadAdminTopics', () => {
  it('asks the internal listing endpoint for every topic', async () => {
    const get = vi.fn().mockResolvedValue([topic]);

    const { outcome } = await run(loadAdminTopics, { context: createContext(fakeApi({ get })) });

    expect(get.mock.calls[0]?.[0]).toBe('/api/internal/topics');
    expect(outcome.topics).toEqual([topic]);
  });

  it('leaves the flash for the next attempt when the API fails', async () => {
    const { response: written } = await run(deleteTopic, {
      context: createContext(
        fakeApi({ delete: () => Promise.resolve({ ok: true, data: undefined }) }),
      ),
      method: 'POST',
      params: { id: topic.id },
    });
    const failing = fakeApi({
      get: () => Promise.reject(new Response('Bad Gateway', { status: 502 })),
    });

    await expect(
      run(loadAdminTopics, { context: createContext(failing), cookie: cookieFrom(written) }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof Response && !error.headers.has('Set-Cookie'),
    );
  });
});

describe('loadAdminTopicToEdit', () => {
  it('fetches the topic by id', async () => {
    const get = vi.fn().mockResolvedValue(topic);

    const { outcome } = await run(loadAdminTopicToEdit, {
      context: createContext(fakeApi({ get })),
      params: { id: topic.id },
    });

    expect(get.mock.calls[0]?.[0]).toBe(`/api/internal/topics/${topic.id}`);
    expect(outcome.topic).toEqual(topic);
    expect(outcome.notification).toBeUndefined();
  });

  // `:id` matches anything, so this is reachable by typing a URL. It is a page that does not
  // exist — not the bad gateway that letting the API reject the id would produce.
  it.each([
    ['a non-uuid segment', { id: 'not-a-uuid' }],
    ['no segment at all', {}],
  ])('answers %s with a 404 rather than calling the API', async (_case, params) => {
    await expect(
      run(loadAdminTopicToEdit, { context: createContext(fakeApi()), params }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('saveTopic', () => {
  function save(context: RouterContextProvider, body: Record<string, string>) {
    return run(saveTopic, {
      context,
      method: 'POST',
      body: { version: SHOWN_VERSION, ...body },
      params: { id: topic.id },
    });
  }

  it('does not call the API when the submission is invalid', async () => {
    const { outcome } = await save(createContext(fakeApi()), { ...valid, title: '' });

    expect(outcome).toEqual({
      values: { ...valid, title: '' },
      fieldErrors: { title: 'Enter a topic name' },
      version: SHOWN_VERSION,
    });
  });

  it('puts the trimmed values to the topic id', async () => {
    const put = vi.fn().mockResolvedValue({ ok: true, data: { changed: true, topic } });

    await save(createContext(fakeApi({ put })), { ...valid, title: '  Air quality  ' });

    expect(put.mock.calls[0]?.[0]).toBe(`/api/internal/topics/${topic.id}`);
    expect(put.mock.calls[0]?.[1]).toEqual({ ...valid, version: SHOWN_VERSION });
  });

  // Redirecting rather than rendering is what stops a refresh re-submitting, and addressing
  // the redirect by id is what keeps an edited slug from moving the publisher.
  it.each([true, false])(
    'redirects back to the same edit page when changed is %s',
    async (changed) => {
      const put = vi.fn().mockResolvedValue({ ok: true, data: { changed, topic } });

      const { response } = await save(createContext(fakeApi({ put })), valid);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe(editTopicPath(topic.id));
      expect(response.headers.get('Set-Cookie')).toContain('fphd-internal-flash=');
    },
  );

  it.each([
    [
      'a rejected submission',
      400,
      { error: 'validation_failed', fieldErrors: { slug: 'Enter a slug' } },
      { slug: 'Enter a slug' },
    ],
    [
      'a slug already in use',
      409,
      { error: 'slug_taken', fieldErrors: { slug: 'This slug is already used' } },
      { slug: 'This slug is already used' },
    ],
  ])('renders %s against its field', async (_case, status, error, fieldErrors) => {
    const put = vi.fn().mockResolvedValue({ ok: false, status, error });

    const { outcome } = await save(createContext(fakeApi({ put })), valid);

    expect(outcome).toEqual({ values: valid, fieldErrors, version: SHOWN_VERSION });
  });

  it('reports a refusal that names no field as the form not saved', async () => {
    const put = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, error: { error: 'invalid_id' } });

    const { outcome } = await save(createContext(fakeApi({ put })), valid);

    expect(outcome).toEqual({
      values: valid,
      fieldErrors: {},
      formError: FORM_NOT_SAVED,
      version: SHOWN_VERSION,
    });
  });

  it('keeps the submitted values when the topic changed since, to save against its version now', async () => {
    const version = 'b'.repeat(64);
    const put = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 409, error: { error: 'changed', version } });

    const { outcome } = await save(createContext(fakeApi({ put })), valid);

    expect(outcome).toEqual({ values: valid, fieldErrors: {}, formError: TOPIC_CHANGED, version });
  });

  it('keeps the submitted values when the API rejects them', async () => {
    const put = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      error: { error: 'slug_taken', fieldErrors: { slug: 'This slug is already used' } },
    });

    const { outcome } = await save(createContext(fakeApi({ put })), {
      ...valid,
      slug: 'taken-slug',
    });

    expect(outcome).toMatchObject({ values: { ...valid, slug: 'taken-slug' } });
  });
});

describe('createTopic', () => {
  function create(context: RouterContextProvider, body: Record<string, string>) {
    return run(createTopic, { context, method: 'POST', body });
  }

  it('does not call the API when the submission is invalid', async () => {
    const { outcome } = await create(createContext(fakeApi()), { ...valid, title: '' });

    expect(outcome).toEqual({
      values: { ...valid, title: '' },
      fieldErrors: { title: 'Enter a topic name' },
    });
  });

  it('posts the trimmed values, then redirects to the new topic with a flash', async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, data: { topic } });

    const { response } = await create(createContext(fakeApi({ post })), {
      ...valid,
      title: '  Air quality  ',
    });

    expect(post.mock.calls[0]?.[0]).toBe('/api/internal/topics');
    expect(post.mock.calls[0]?.[1]).toEqual(valid);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(editTopicPath(topic.id));
    expect(response.headers.get('Set-Cookie')).toContain('fphd-internal-flash=');
  });

  it('keeps the submitted values against the field when the slug is taken', async () => {
    const post = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      error: { error: 'slug_taken', fieldErrors: { slug: 'This slug is already used' } },
    });

    const { outcome } = await create(createContext(fakeApi({ post })), {
      ...valid,
      slug: 'taken-slug',
    });

    expect(outcome).toEqual({
      values: { ...valid, slug: 'taken-slug' },
      fieldErrors: { slug: 'This slug is already used' },
    });
  });

  it('reports a refusal that names no field as the form not saved', async () => {
    const post = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      error: { error: 'validation_failed', fieldErrors: {} },
    });

    const { outcome } = await create(createContext(fakeApi({ post })), valid);

    expect(outcome).toEqual({ values: valid, fieldErrors: {}, formError: FORM_NOT_SAVED });
  });
});

describe('loadAdminTopicToDelete', () => {
  it('fetches the topic by id so the page can name what will go', async () => {
    const get = vi.fn().mockResolvedValue(topic);

    const { outcome } = await run(loadAdminTopicToDelete, {
      context: createContext(fakeApi({ get })),
      params: { id: topic.id },
    });

    expect(get.mock.calls[0]?.[0]).toBe(`/api/internal/topics/${topic.id}`);
    expect(outcome.topic).toEqual(topic);
  });

  it('answers a malformed id with a 404 rather than calling the API', async () => {
    await expect(
      run(loadAdminTopicToDelete, {
        context: createContext(fakeApi()),
        params: { id: 'not-a-uuid' },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('deleteTopic', () => {
  it('deletes by id, then redirects to the list with a flash', async () => {
    const del = vi.fn().mockResolvedValue({ ok: true, data: undefined });

    const { response } = await run(deleteTopic, {
      context: createContext(fakeApi({ delete: del })),
      method: 'POST',
      params: { id: topic.id },
    });

    expect(del.mock.calls[0]?.[0]).toBe(`/api/internal/topics/${topic.id}`);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(TOPICS_ADMIN_PATH);
    expect(response.headers.get('Set-Cookie')).toContain('fphd-internal-flash=');
  });

  it('sends a topic linked since the confirmation loaded back to that page, unflashed', async () => {
    const del = vi.fn().mockResolvedValue({ ok: false, status: 409, error: { error: 'in_use' } });

    const { response } = await run(deleteTopic, {
      context: createContext(fakeApi({ delete: del })),
      method: 'POST',
      params: { id: topic.id },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(deleteTopicPath(topic.id));
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('answers a malformed id with a 404 rather than calling the API', async () => {
    await expect(
      run(deleteTopic, {
        context: createContext(fakeApi()),
        method: 'POST',
        params: { id: 'not-a-uuid' },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('the message a create or delete leaves for the page it redirects to', () => {
  it('tells the new topic edit page that the topic was created', async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, data: { topic } });
    const { response } = await run(createTopic, {
      context: createContext(fakeApi({ post })),
      method: 'POST',
      body: valid,
    });

    const { outcome } = await run(loadAdminTopicToEdit, {
      context: createContext(fakeApi({ get: () => Promise.resolve(topic) })),
      cookie: cookieFrom(response),
      params: { id: topic.id },
    });

    expect(outcome.notification).toBe('Topic created');
  });

  it('tells the topic list that the topic was deleted', async () => {
    const { response } = await run(deleteTopic, {
      context: createContext(
        fakeApi({ delete: () => Promise.resolve({ ok: true, data: undefined }) }),
      ),
      method: 'POST',
      params: { id: topic.id },
    });

    const { outcome } = await run(loadAdminTopics, {
      context: createContext(fakeApi({ get: () => Promise.resolve([]) })),
      cookie: cookieFrom(response),
    });

    expect(outcome.notification).toBe('Topic deleted');
  });
});

describe('the message a save leaves for the page it redirects to', () => {
  async function messageAfter(changed: boolean): Promise<string | undefined> {
    const put = vi.fn().mockResolvedValue({ ok: true, data: { changed, topic } });
    const { response } = await run(saveTopic, {
      context: createContext(fakeApi({ put })),
      method: 'POST',
      body: valid,
      params: { id: topic.id },
    });

    const { outcome } = await run(loadAdminTopicToEdit, {
      context: createContext(fakeApi({ get: () => Promise.resolve(topic) })),
      cookie: cookieFrom(response),
      params: { id: topic.id },
    });

    return outcome.notification;
  }

  it('says the topic was updated when something changed', async () => {
    expect(await messageAfter(true)).toBe('Topic updated');
  });

  it('says nothing changed when the submission matched what was stored', async () => {
    expect(await messageAfter(false)).toBe('No changes were made');
  });
});
