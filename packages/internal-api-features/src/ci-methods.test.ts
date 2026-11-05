import { request } from '@fphd/express/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { internalCiMethodsRouter } from './ci-methods.ts';
import { ciMethodListSchema } from './contract.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  type FakeInternalRepositoryOverrides,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const path = '/api/internal/ci-methods';

const methods = [
  {
    id: '019fa38f-073f-764e-9ac6-1c4d03b1cb92',
    name: "Byar's method",
    description: 'A standard description.',
    kind: 'standard',
  },
  {
    id: '019fa38f-0746-7e1c-8826-0ee5d2b83fef',
    name: 'Other method',
    description: null,
    kind: 'other',
  },
] as const;

function createTestApp(overrides: FakeInternalRepositoryOverrides['ciMethods'] = {}): Express {
  const repositories = createFakeInternalRepositories({ ciMethods: overrides });

  return createRouterTestApp(internalCiMethodsRouter(repositories.ciMethods, testSessionVerifier));
}

describe('GET /api/internal/ci-methods', () => {
  it('lists every method in the order the repository gives, in the shape the contract describes', async () => {
    const response = await request(createTestApp({ list: vi.fn().mockResolvedValue(methods) }))
      .get(path)
      .set('Cookie', await testSessionCookie(['publisher']));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(methods);
    expect(ciMethodListSchema.safeParse(response.body).success).toBe(true);
  });

  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp()).get(path);

    expect(response.status).toBe(401);
  });

  it('rejects a signed-in non-publisher', async () => {
    const response = await request(createTestApp())
      .get(path)
      .set('Cookie', await testSessionCookie(['public']));

    expect(response.status).toBe(403);
  });
});
