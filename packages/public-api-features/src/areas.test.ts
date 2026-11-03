import { createFakeRepositories, type FakeRepositoryOverrides } from '@fphd/db/testing';
import { request } from '@fphd/express/testing';
import express, { type Express } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { areasRouter } from './areas.ts';

function createTestApp(overrides: FakeRepositoryOverrides['areas'] = {}): Express {
  const app = express();

  app.use(areasRouter(createFakeRepositories({ areas: overrides }).areas));

  return app;
}

describe('GET /api/areas/lookup', () => {
  it('looks up areas by code, deduplicating and filtering malformed ones', async () => {
    const listByCodes = vi
      .fn()
      .mockResolvedValue([{ code: 'E06000052', name: 'Cornwall', areaType: 'UA unchanged' }]);
    const app = createTestApp({ listByCodes });

    const response = await request(app).get(
      '/api/areas/lookup?areaCode=E06000052&areaCode=E06000052&areaCode=..%2Fbad',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { code: 'E06000052', name: 'Cornwall', areaType: 'UA unchanged' },
    ]);
    expect(listByCodes).toHaveBeenCalledWith(['E06000052']);
  });

  it('rejects a lookup request without any well-formed area code', async () => {
    const app = createTestApp();

    expect((await request(app).get('/api/areas/lookup')).status).toBe(400);
    expect((await request(app).get('/api/areas/lookup?areaCode=..%2Fbad')).status).toBe(400);
  });
});

describe('GET /api/areas/search', () => {
  it('searches areas, trimming and capping the inputs', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ search });

    const response = await request(app).get(
      `/api/areas/search?q=${encodeURIComponent(`  ${'corn'.padEnd(120, 'w')}  `)}&limit=500`,
    );

    expect(response.status).toBe(200);
    expect(search).toHaveBeenCalledWith('corn'.padEnd(100, 'w'), 100);

    await request(app).get('/api/areas/search?q=corn');
    expect(search).toHaveBeenLastCalledWith('corn', 50);
  });

  it('rejects a search request missing its query', async () => {
    const app = createTestApp();

    expect((await request(app).get('/api/areas/search')).status).toBe(400);
    expect((await request(app).get('/api/areas/search?q=%20%20')).status).toBe(400);
  });

  it('rejects a query of control characters alone as missing', async () => {
    const response = await request(createTestApp()).get('/api/areas/search?q=%00%7F');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'q_required' });
  });

  it('searches a query holding a control character as words separated by a space', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ search });

    const response = await request(app).get('/api/areas/search?q=corn%00wall');

    expect(response.status).toBe(200);
    expect(search).toHaveBeenCalledWith('corn wall', 50);
  });
});

describe('GET /api/areas/parents', () => {
  it('resolves area parents of one type, filtering malformed codes', async () => {
    const listParents = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ listParents });

    const response = await request(app).get(
      '/api/areas/parents?areaCode=E06000052&areaCode=..%2Fbad&parentType=Regions%20(statistical)',
    );

    expect(response.status).toBe(200);
    expect(listParents).toHaveBeenCalledWith(['E06000052'], 'Regions (statistical)');
  });

  it('rejects a parents request missing or overflowing parentType, or with a control character', async () => {
    const app = createTestApp();

    expect((await request(app).get('/api/areas/parents?areaCode=E06000052')).status).toBe(400);
    expect(
      (await request(app).get('/api/areas/parents?areaCode=E06000052&parentType=%00')).status,
    ).toBe(400);
    expect(
      (
        await request(app).get(
          `/api/areas/parents?areaCode=E06000052&parentType=${'a'.repeat(101)}`,
        )
      ).status,
    ).toBe(400);
  });
});

describe('GET /api/areas', () => {
  it('lists current areas of a type', async () => {
    const listByType = vi
      .fn()
      .mockResolvedValue([{ code: 'E12000001', name: 'North East region (statistical)' }]);
    const app = createTestApp({ listByType });

    const response = await request(app).get(
      `/api/areas?areaType=${encodeURIComponent('Regions (statistical)')}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        areaType: 'Regions (statistical)',
        areas: [{ code: 'E12000001', name: 'North East region (statistical)' }],
      },
    ]);
    expect(listByType).toHaveBeenCalledWith('Regions (statistical)');
  });

  it('lists the display groups and answers a display-group areas request', async () => {
    const listDisplayGroups = vi.fn().mockResolvedValue(['Local authorities', 'GP practices']);
    const listByGroups = vi
      .fn()
      .mockResolvedValue([
        { displayGroup: 'Local authorities', areas: [{ code: 'E06000052', name: 'Cornwall' }] },
      ]);
    const app = createTestApp({ listDisplayGroups, listByGroups });

    expect((await request(app).get('/api/areas/display-groups')).body).toEqual([
      'Local authorities',
      'GP practices',
    ]);

    const response = await request(app).get('/api/areas?displayGroup=Local+authorities');
    expect(response.body).toEqual([
      { displayGroup: 'Local authorities', areas: [{ code: 'E06000052', name: 'Cornwall' }] },
    ]);
    expect(listByGroups).toHaveBeenCalledWith(['Local authorities'], undefined);
  });

  it('caps a display-group preview request', async () => {
    const listByGroups = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ listByGroups });

    await request(app).get('/api/areas?displayGroup=GP+practices&limit=500');

    expect(listByGroups).toHaveBeenCalledWith(['GP practices'], 101);
  });

  it('de-duplicates and caps repeated area queries', async () => {
    const listByGroups = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ listByGroups });

    const repeats = Array.from({ length: 30 }, (_, i) => `displayGroup=Group+${i % 25}`).join('&');
    await request(app).get(`/api/areas?${repeats}`);

    expect(listByGroups).toHaveBeenCalledOnce();
    expect(listByGroups).toHaveBeenCalledWith(
      Array.from({ length: 20 }, (_, i) => `Group ${i}`),
      undefined,
    );
  });

  it('rejects an areas request without an area type', async () => {
    const response = await request(createTestApp()).get('/api/areas');

    expect(response.status).toBe(400);
  });

  it('ignores an area type or display group holding a control character', async () => {
    const listByType = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ listByType });

    expect((await request(app).get('/api/areas?areaType=%00&displayGroup=%00')).status).toBe(400);

    const response = await request(app).get('/api/areas?areaType=Regions&areaType=Regions%00');

    expect(response.status).toBe(200);
    expect(listByType.mock.calls).toEqual([['Regions']]);
  });

  it('ignores query parameters it does not know', async () => {
    const listByType = vi.fn().mockResolvedValue([]);
    const app = createTestApp({ listByType });

    expect((await request(app).get('/api/areas?areaType=GPs&colour=teal')).status).toBe(200);
    expect(listByType).toHaveBeenCalledWith('GPs');
    expect((await request(app).get('/api/areas?colour=teal')).status).toBe(400);
  });
});
