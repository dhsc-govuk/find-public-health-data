import type { Logger } from '@fphd/logger';
import { describe, expect, it, vi } from 'vitest';

import { serverLogging } from './server-logging.ts';

function stubLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() } as unknown as Logger;
}

describe('serverLogging', () => {
  it('logs a stop that did not complete at fatal, the last line before the process exits', () => {
    const logger = stubLogger();
    const failure = new Error('cleanup hung');

    serverLogging(logger, { port: 3000, revision: 'abc123' }).onError(failure);

    expect(logger.fatal).toHaveBeenCalledWith({ err: failure }, 'Did not stop cleanly');
    expect(logger.error).not.toHaveBeenCalled();
  });
});
