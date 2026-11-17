import { describe, expect, it, vi } from 'vitest';

import { withTeardown } from './migrations.ts';

describe('withTeardown', () => {
  it('returns the result and runs the teardown', async () => {
    const teardown = vi.fn().mockResolvedValue(undefined);

    await expect(withTeardown(() => Promise.resolve('done'), teardown)).resolves.toBe('done');
    expect(teardown).toHaveBeenCalledOnce();
  });

  it('keeps the original error when the teardown also fails', async () => {
    const original = new Error('migration failed');

    await expect(
      withTeardown(
        () => Promise.reject(original),
        () => Promise.reject(new Error('connection closed')),
      ),
    ).rejects.toBe(original);
  });

  it('reports the teardown failure when the work fails too', async () => {
    const original = new Error('migration failed');
    const teardownError = new Error('recreate failed');
    const onTeardownError = vi.fn();

    await expect(
      withTeardown(
        () => Promise.reject(original),
        () => Promise.reject(teardownError),
        onTeardownError,
      ),
    ).rejects.toBe(original);
    expect(onTeardownError).toHaveBeenCalledWith(teardownError);
  });

  it('propagates a teardown failure when the work itself succeeded', async () => {
    const teardownError = new Error('reset failed');

    await expect(
      withTeardown(
        () => Promise.resolve('done'),
        () => Promise.reject(teardownError),
      ),
    ).rejects.toBe(teardownError);
  });
});
