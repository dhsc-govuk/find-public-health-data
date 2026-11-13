import { expect, it, vi } from 'vitest';
import type { Database } from './client.ts';
import {
  getPublishedIndicatorById,
  resolveIndicatorIdBySlug,
  resolvePublishedIndicatorId,
} from './indicator-repository.ts';
import { createRepositories } from './repositories.ts';

vi.mock('./indicator-repository.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./indicator-repository.ts')>()),
  getPublishedIndicatorById: vi.fn(),
  resolveIndicatorIdBySlug: vi.fn(),
  resolvePublishedIndicatorId: vi.fn(),
}));

const db = {} as Database;

it('runs every short id and slug lookup, even when they overlap', async () => {
  const gate = Promise.withResolvers<string>();
  vi.mocked(resolvePublishedIndicatorId).mockReturnValue(gate.promise);
  vi.mocked(resolveIndicatorIdBySlug).mockReturnValue(gate.promise);
  const { indicators } = createRepositories(db);
  const lookups = [
    indicators.resolveId(241),
    indicators.resolveId(241),
    indicators.resolveIdBySlug('diabetes-qof-prevalence'),
    indicators.resolveIdBySlug('diabetes-qof-prevalence'),
  ];
  gate.resolve('indicator-id');
  expect(await Promise.all(lookups)).toEqual(Array(4).fill('indicator-id'));
  expect(resolvePublishedIndicatorId).toHaveBeenCalledTimes(2);
  expect(resolveIndicatorIdBySlug).toHaveBeenCalledTimes(2);
});

it('shares other overlapping indicator reads', async () => {
  const gate = Promise.withResolvers<undefined>();
  vi.mocked(getPublishedIndicatorById).mockReturnValue(gate.promise);
  const { indicators } = createRepositories(db);
  const reads = [indicators.findPublishedById('ind-1'), indicators.findPublishedById('ind-1')];
  gate.resolve(undefined);
  await Promise.all(reads);
  expect(getPublishedIndicatorById).toHaveBeenCalledOnce();
});
