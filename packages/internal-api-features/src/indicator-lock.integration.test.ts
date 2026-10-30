import { schema } from '@fphd/db';
import { apiLogin, auditEntriesFor, createTestDb } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import { createFakeBlobStorage } from '@fphd/internal-storage/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { indicatorTaskKeySchema } from './contract.ts';
import { editVersion } from './edit-version.ts';
import { internalApiRoutes } from './index.ts';
import { AS_ACTOR, newDraft } from './indicator-repository.testing.ts';
import { completeDraft } from './indicator-workflow.testing.ts';
import { submitIndicator } from './indicator-workflow-repository.ts';
import { createInternalRepositories } from './repositories.ts';
import { createRouterTestApp, testSessionCookie, testSessionVerifier } from './testing.ts';

const { indicatorVersion } = schema;

const testDb = await createTestDb({ template: 'seeded' });
// The routes run as internal_api, as they do deployed.
const db = testDb.connectDb({ login: apiLogin('internal_api') });
const storage = createFakeBlobStorage();
const app = createRouterTestApp(
  internalApiRoutes({
    repositories: createInternalRepositories(db),
    session: testSessionVerifier,
    storage,
  }),
);

afterAll(async () => {
  await testDb.drop();
});

const SECTION_KEYS = indicatorTaskKeySchema.options.filter(
  (key) => key !== 'name' && key !== 'data-table',
);

type Method = 'get' | 'put' | 'patch' | 'post';

// The lock and draft checks run before the version check, so any valid version works here.
const version = editVersion({});

/** Every route that reads a draft to edit it or writes one, with a body it would accept. */
const EDIT_PATHS: [Method, string, object?][] = [
  ...SECTION_KEYS.map((key): [Method, string] => ['get', `/${key}`]),
  [
    'put',
    '/definition-and-rationale',
    { answers: { definition: 'Changed', rationale: 'Changed' }, version },
  ],
  ['patch', '', { name: 'Renamed while locked', version }],
  ['post', '/data-uploads'],
  ['get', '/data-uploads/latest'],
  ['get', '/data-table'],
  ['put', '/data-table/confirmation', { batchId: '00000000-0000-7000-8000-000000000001' }],
];

async function send(method: Method, indicatorId: string, path: string, body?: object) {
  const call = request(app)
    [method](`/api/internal/indicators/${indicatorId}${path}`)
    .set('Cookie', await testSessionCookie(['internal', 'publisher']));
  if (method === 'post') {
    return call.attach('dataTable', Buffer.from('area_code\nE92000001\n'), 'data.csv');
  }
  return body === undefined ? call : call.send(body);
}

async function lastEdit(indicatorId: string) {
  const [row] = await db
    .select({ updatedAt: indicatorVersion.updatedAt, name: indicatorVersion.name })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.indicatorId, indicatorId));
  return row;
}

describe('a draft locked for review', () => {
  let lockedId: string;

  beforeAll(async () => {
    const created = await newDraft(db, 'Locked for review');
    const shown = await completeDraft(db, created);
    const submitted = await submitIndicator(db, created.indicatorId, shown, AS_ACTOR);
    if (!submitted.ok) throw new Error(`could not submit: ${submitted.reason}`);
    lockedId = created.indicatorId;
  });

  it.each(EDIT_PATHS)('answers %s %s with 409 locked', async (method, path, body) => {
    const response = await send(method, lockedId, path, body);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'locked' });
  });

  it.each([
    ['put', '/definition-and-rationale', { answers: { definition: '' }, version }],
    ['patch', '', { name: '', version }],
    ['put', '/data-table/confirmation', {}],
  ] as const)(
    'answers %s %s with 409 locked even when the answers are refused',
    async (method, path, body) => {
      const response = await send(method, lockedId, path, body);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'locked' });
    },
  );

  it('is left as it was by every refused write, and nothing is stored', async () => {
    const put = vi.spyOn(storage, 'put');
    const before = await lastEdit(lockedId);
    const entries = (await auditEntriesFor(db, lockedId)).length;

    for (const [method, path, body] of EDIT_PATHS) await send(method, lockedId, path, body);

    expect(await lastEdit(lockedId)).toEqual(before);
    expect(await auditEntriesFor(db, lockedId)).toHaveLength(entries);
    expect(put).not.toHaveBeenCalled();
  });

  it('still has its task list served, so its state can be shown', async () => {
    const response = await send('get', lockedId, '/task-list');

    expect(response.status).toBe(200);
    expect(response.body.canSubmit).toBe(true);
  });
});

describe('an indicator with no draft', () => {
  let publishedId: string;

  beforeAll(async () => {
    const created = await newDraft(db, 'Published with no draft');
    await db
      .update(indicatorVersion)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(indicatorVersion.id, created.versionId));
    publishedId = created.indicatorId;
  });

  it.each(EDIT_PATHS)('answers %s %s with 404 no_draft', async (method, path, body) => {
    const response = await send(method, publishedId, path, body);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'no_draft' });
  });
});
