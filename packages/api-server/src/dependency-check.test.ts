import { request } from '@fphd/express/testing';
import { createCapturingLogger } from '@fphd/logger/testing';
import { describe, expect, it } from 'vitest';

import { checkDependencies } from './dependency-check.ts';
import { createApiApp } from './index.ts';

function connectionRefused(): Error {
  return Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
}

describe('checkDependencies', () => {
  it('logs one line per unreachable dependency, with its name and error code', async () => {
    const { lines, logger } = createCapturingLogger('test-api');

    await checkDependencies(logger, [
      { name: 'database', check: () => Promise.reject(connectionRefused()) },
      { name: 'blob storage', check: () => Promise.resolve() },
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 50,
      msg: 'Dependency unreachable at start-up',
      dependency: 'database',
      err: { code: 'ECONNREFUSED' },
    });
  });

  it('logs nothing when every dependency answers', async () => {
    const { lines, logger } = createCapturingLogger('test-api');

    await checkDependencies(logger, [{ name: 'database', check: () => Promise.resolve() }]);

    expect(lines).toEqual([]);
  });

  it('leaves an API with an unreachable database answering its probes', async () => {
    const { lines, logger } = createCapturingLogger('test-api');
    const app = createApiApp({ logger, serviceName: 'test-api' });

    await checkDependencies(logger, [
      { name: 'database', check: () => Promise.reject(connectionRefused()) },
    ]);

    expect(lines[0]).toMatchObject({ msg: 'Dependency unreachable at start-up' });
    expect((await request(app).get('/livez')).status).toBe(200);
    expect((await request(app).get('/readyz')).status).toBe(200);
  });
});
