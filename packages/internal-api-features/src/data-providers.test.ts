import { request } from '@fphd/express/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { dataProviderListSchema } from './contract.ts';
import { internalDataProvidersRouter } from './data-providers.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  type FakeInternalRepositoryOverrides,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';

const path = '/api/internal/data-providers';

const providers = [
  {
    id: '01a0d858-9885-764e-8d53-6826aec67001',
    name: 'Office for National Statistics (ONS)',
    sources: [{ id: '01a0d858-9885-764e-8d53-6826aec67002', name: 'Annual mortality extract' }],
  },
  { id: '01a0d858-9885-764e-8d53-6826aec67004', name: 'Estimated', sources: [] },
];

function createTestApp(overrides: FakeInternalRepositoryOverrides['dataProviders'] = {}): Express {
  const repositories = createFakeInternalRepositories({ dataProviders: overrides });

  return createRouterTestApp(
    internalDataProvidersRouter(repositories.dataProviders, testSessionVerifier),
  );
}

describe('GET /api/internal/data-providers', () => {
  it('lists every provider with its sources in the order the repository gives, in the shape the contract describes', async () => {
    const response = await request(createTestApp({ list: vi.fn().mockResolvedValue(providers) }))
      .get(path)
      .set('Cookie', await testSessionCookie(['publisher']));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(providers);
    expect(dataProviderListSchema.safeParse(response.body).success).toBe(true);
  });

  it('rejects an anonymous request', async () => {
    const response = await request(createTestApp()).get(path);

    expect(response.status).toBe(401);
  });

  it('rejects a signed-in non-publisher', async () => {
    const response = await request(createTestApp())
      .get(path)
      .set('Cookie', await testSessionCookie([]));

    expect(response.status).toBe(403);
  });
});
