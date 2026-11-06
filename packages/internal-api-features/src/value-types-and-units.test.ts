import { request } from '@fphd/express/testing';
import type { Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { valueTypeAndUnitOptionsSchema } from './contract.ts';
import {
  createFakeInternalRepositories,
  createRouterTestApp,
  type FakeInternalRepositoryOverrides,
  testSessionCookie,
  testSessionVerifier,
} from './testing.ts';
import { internalValueTypesAndUnitsRouter } from './value-types-and-units.ts';

const path = '/api/internal/value-types-and-units';

const options = {
  valueTypes: [{ id: '01a0d8a5-3ca2-7315-bfca-96c7324d4347', name: 'Count' }],
  units: [{ id: '01a0d8a5-3ca2-7315-bfca-96d615820bd4', name: '%' }],
};

function createTestApp(
  overrides: FakeInternalRepositoryOverrides['valueTypesAndUnits'] = {},
): Express {
  const repositories = createFakeInternalRepositories({ valueTypesAndUnits: overrides });

  return createRouterTestApp(
    internalValueTypesAndUnitsRouter(repositories.valueTypesAndUnits, testSessionVerifier),
  );
}

describe('GET /api/internal/value-types-and-units', () => {
  it('lists the value types and units as the repository gives them, in the shape the contract describes', async () => {
    const response = await request(
      createTestApp({ listOptions: vi.fn().mockResolvedValue(options) }),
    )
      .get(path)
      .set('Cookie', await testSessionCookie(['publisher']));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(options);
    expect(valueTypeAndUnitOptionsSchema.safeParse(response.body).success).toBe(true);
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
