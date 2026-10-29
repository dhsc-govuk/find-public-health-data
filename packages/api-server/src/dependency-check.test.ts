import { request } from '@fphd/express/testing';
import { createCapturingLogger } from '@fphd/logger/testing';
import { describe, expect, it, vi } from 'vitest';

import { checkDependencies } from './dependency-check.ts';
import { createApiApp } from './index.ts';

function connectionRefused(): Error {
  return Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
}

/** A check that fails `times` times, then passes. */
function failing(times: number) {
  let calls = 0;
  return async () => {
    calls += 1;
    if (calls <= times) throw connectionRefused();
  };
}

const retryAfterMs = 1;

describe('checkDependencies', () => {
  it('logs each failed check, with the name and error code, until the check passes', async () => {
    const { lines, logger } = createCapturingLogger('test-api');

    await checkDependencies(logger, [{ name: 'database', check: failing(2) }], { retryAfterMs });

    expect(lines).toHaveLength(3);
    for (const line of lines.slice(0, 2)) {
      expect(line).toMatchObject({
        level: 50,
        msg: 'Dependency unreachable at start-up',
        dependency: 'database',
        err: { code: 'ECONNREFUSED' },
      });
    }
    expect(lines[2]).toMatchObject({
      level: 30,
      msg: 'Dependency reachable',
      dependency: 'database',
      failures: 2,
    });
  });

  it('retries only the dependency that failed', async () => {
    const { lines, logger } = createCapturingLogger('test-api');
    const storageCheck = vi.fn(async () => {});

    await checkDependencies(
      logger,
      [
        { name: 'database', check: failing(1) },
        { name: 'blob storage', check: storageCheck },
      ],
      { retryAfterMs },
    );

    expect(storageCheck).toHaveBeenCalledOnce();
    expect(lines.map((line) => line.dependency)).toEqual(['database', 'database']);
  });

  it('waits between attempts', async () => {
    const { logger } = createCapturingLogger('test-api');
    const started = Date.now();

    await checkDependencies(logger, [{ name: 'database', check: failing(1) }], {
      retryAfterMs: 50,
    });

    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
  });

  it('logs nothing when every dependency answers', async () => {
    const { lines, logger } = createCapturingLogger('test-api');

    await checkDependencies(logger, [{ name: 'database', check: failing(0) }]);

    expect(lines).toEqual([]);
  });

  it('leaves an API with an unreachable database answering its probes', async () => {
    const { lines, logger } = createCapturingLogger('test-api');
    const app = createApiApp({ logger, serviceName: 'test-api' });

    await checkDependencies(logger, [{ name: 'database', check: failing(1) }], { retryAfterMs });

    expect(lines[0]).toMatchObject({ msg: 'Dependency unreachable at start-up' });
    expect((await request(app).get('/livez')).status).toBe(200);
    expect((await request(app).get('/readyz')).status).toBe(200);
  });
});
