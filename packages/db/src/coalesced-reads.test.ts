import { expect, it, vi } from 'vitest';
import { coalescedReads } from './coalesced-reads.ts';

it('shares matching concurrent reads and reads again after completion', async () => {
  const gate = Promise.withResolvers<string>();
  const load = vi.fn((_id: string) => gate.promise);
  const reads = coalescedReads({ load });
  const first = reads.load('one');
  expect(reads.load('one')).toBe(first);
  await Promise.resolve();
  expect(load).toHaveBeenCalledExactlyOnceWith('one');
  gate.resolve('current');
  expect(await first).toBe('current');
  await reads.load('one');
  expect(load).toHaveBeenCalledTimes(2);
});

it('keeps different arguments, methods and repository instances independent', async () => {
  const gate = Promise.withResolvers<string>();
  const load = vi.fn((_ids: string[], _mode: string) => gate.promise);
  const first = coalescedReads({ load, other: load });
  const second = coalescedReads({ load });
  const requests = [
    first.load(['a', 'b'], 'latest'),
    first.load(['b', 'a'], 'latest'),
    first.load(['a', 'b'], 'recent'),
    first.other(['a', 'b'], 'latest'),
    second.load(['a', 'b'], 'latest'),
  ];
  gate.resolve('value');
  await Promise.all(requests);
  expect(load).toHaveBeenCalledTimes(5);
});

it('shares failures with current callers and retries the next read', async () => {
  const error = new Error('database unavailable');
  const load = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('recovered');
  const reads = coalescedReads({ load });
  const first = reads.load();
  const second = reads.load();
  expect(await Promise.allSettled([first, second])).toEqual([
    { status: 'rejected', reason: error },
    { status: 'rejected', reason: error },
  ]);
  expect(await reads.load()).toBe('recovered');
  expect(load).toHaveBeenCalledTimes(2);
});

it('clears a read that throws before returning a promise', async () => {
  const load = vi.fn((): Promise<string> => {
    throw new Error('unavailable');
  });
  const reads = coalescedReads({ load });
  await expect(reads.load()).rejects.toThrow('unavailable');
  await expect(reads.load()).rejects.toThrow('unavailable');
  expect(load).toHaveBeenCalledTimes(2);
});
