import { TEAM_IDS } from '@fphd/auth';
import type { ApiClient } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { describe, expect, it, vi } from 'vitest';

import { signedInContext } from '../session.testing.ts';
import { loadDashboard } from './loader.ts';

const indicator = {
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Life expectancy at birth',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

async function load(
  url: string,
  get: ApiClient['get'],
  roles: readonly string[] = ['publisher'],
  teams: readonly string[] = [TEAM_IDS.teamA],
) {
  const context = await signedInContext(roles, teams);
  context.set(apiContext, { get } as unknown as ApiClient);

  return loadDashboard({ context, params: {}, request: new Request(url) } as never);
}

function apiPage(page: number, total: number, indicators = [indicator]) {
  return vi.fn().mockResolvedValue({ indicators, page, pageSize: 10, total });
}

describe('loadDashboard', () => {
  it('asks for the first page when the address names none', async () => {
    const get = apiPage(1, 23);

    const outcome = await load('https://internal.test/dashboard', get);

    expect(get.mock.calls[0]?.[0]).toBe('/api/internal/indicators?page=1');
    expect(outcome).toEqual({
      underReview: null,
      toReview: null,
      list: { canCreate: true, indicators: [indicator], page: 1, totalPages: 3 },
    });
  });

  it('asks for the page in the address', async () => {
    const get = apiPage(3, 23);

    const outcome = await load('https://internal.test/dashboard?page=3', get);

    expect(get.mock.calls[0]?.[0]).toBe('/api/internal/indicators?page=3');
    expect(outcome.list).toMatchObject({ page: 3, totalPages: 3 });
  });

  it('pages alike whichever tab the address keeps open', async () => {
    const get = apiPage(3, 23);

    await load('https://internal.test/dashboard?page=3&tab=create-and-edit', get);

    expect(get.mock.calls[0]?.[0]).toBe('/api/internal/indicators?page=3');
  });

  it('renders the first page when there are no indicators at all', async () => {
    const outcome = await load('https://internal.test/dashboard', apiPage(1, 0, []));

    expect(outcome.list).toMatchObject({ indicators: [], page: 1, totalPages: 1 });
  });

  it('offers an admin no create action', async () => {
    const outcome = await load('https://internal.test/dashboard', apiPage(1, 1), ['admin'], []);

    expect(outcome.list?.canCreate).toBe(false);
  });

  it('responds 404 to a page past the last one', async () => {
    await expect(
      load('https://internal.test/dashboard?page=4', apiPage(4, 23, [])),
    ).rejects.toSatisfy((error: unknown) => error instanceof Response && error.status === 404);
  });

  it.each(['0', 'two', '1.5'])(
    'responds 404 to a page of %s without asking the API',
    async (page) => {
      const get = vi.fn();

      await expect(load(`https://internal.test/dashboard?page=${page}`, get)).rejects.toSatisfy(
        (error: unknown) => error instanceof Response && error.status === 404,
      );
      expect(get).not.toHaveBeenCalled();
    },
  );

  it('responds 404 when the address names a page twice, as the API would refuse it', async () => {
    const get = vi.fn();

    await expect(load('https://internal.test/dashboard?page=1&page=2', get)).rejects.toSatisfy(
      (error: unknown) => error instanceof Response && error.status === 404,
    );
    expect(get).not.toHaveBeenCalled();
  });

  it('shows an IMRG manager the indicators under review and no list', async () => {
    const underReview = { unassigned: [indicator], assigned: [] };
    const get = vi.fn().mockResolvedValue(underReview);

    const outcome = await load('https://internal.test/dashboard', get, ['imrg-manager'], []);

    expect(get.mock.calls.map(([path]) => path)).toEqual(['/api/internal/indicators-under-review']);
    expect(outcome).toEqual({ underReview, toReview: null, list: null });
  });

  it('responds 404 to a second page for an IMRG manager, whose tables are not paged', async () => {
    const get = vi.fn();

    await expect(
      load('https://internal.test/dashboard?page=2', get, ['imrg-manager'], []),
    ).rejects.toSatisfy((error: unknown) => error instanceof Response && error.status === 404);
    expect(get).not.toHaveBeenCalled();
  });

  it("shows an IMRG manager who publishes both, with a page of their own teams' indicators", async () => {
    const underReview = { unassigned: [], assigned: [indicator] };
    const get = vi
      .fn()
      .mockImplementation(async (path: string) =>
        path === '/api/internal/indicators-under-review'
          ? underReview
          : { indicators: [indicator], page: 2, pageSize: 10, total: 23 },
      );

    const outcome = await load('https://internal.test/dashboard?page=2', get, [
      'publisher',
      'imrg-manager',
    ]);

    expect(get.mock.calls.map(([path]) => path).sort()).toEqual([
      '/api/internal/indicators-under-review',
      '/api/internal/indicators?page=2&teams=own',
    ]);
    expect(outcome).toEqual({
      underReview,
      toReview: null,
      list: { canCreate: true, indicators: [indicator], page: 2, totalPages: 3 },
    });
  });

  it('shows an IMRG reviewer the indicators assigned to them and no list', async () => {
    const get = vi.fn().mockResolvedValue({ indicators: [indicator] });

    const outcome = await load('https://internal.test/dashboard', get, ['imrg-reviewer'], []);

    expect(get.mock.calls.map(([path]) => path)).toEqual(['/api/internal/indicators-to-review']);
    expect(outcome).toEqual({ underReview: null, toReview: [indicator], list: null });
  });

  it("shows a user who is IMRG manager and reviewer the manager's view alone", async () => {
    const underReview = { unassigned: [], assigned: [indicator] };
    const get = vi.fn().mockResolvedValue(underReview);

    const outcome = await load(
      'https://internal.test/dashboard',
      get,
      ['imrg-manager', 'imrg-reviewer'],
      [],
    );

    expect(get.mock.calls.map(([path]) => path)).toEqual(['/api/internal/indicators-under-review']);
    expect(outcome).toEqual({ underReview, toReview: null, list: null });
  });

  it('responds 404 to a second page for an IMRG reviewer, whose list is not paged', async () => {
    const get = vi.fn();

    await expect(
      load('https://internal.test/dashboard?page=2', get, ['imrg-reviewer'], []),
    ).rejects.toSatisfy((error: unknown) => error instanceof Response && error.status === 404);
    expect(get).not.toHaveBeenCalled();
  });

  it("shows an IMRG reviewer who publishes both, with a page of their own teams' indicators", async () => {
    const get = vi
      .fn()
      .mockImplementation(async (path: string) =>
        path === '/api/internal/indicators-to-review'
          ? { indicators: [indicator] }
          : { indicators: [indicator], page: 2, pageSize: 10, total: 23 },
      );

    const outcome = await load(
      'https://internal.test/dashboard?page=2',
      get,
      ['publisher', 'imrg-reviewer'],
      [TEAM_IDS.teamC],
    );

    expect(get.mock.calls.map(([path]) => path).sort()).toEqual([
      '/api/internal/indicators-to-review',
      '/api/internal/indicators?page=2&teams=own',
    ]);
    expect(outcome).toEqual({
      underReview: null,
      toReview: [indicator],
      list: { canCreate: true, indicators: [indicator], page: 2, totalPages: 3 },
    });
  });
});
