import { Writable } from 'node:stream';

import { createLogger, type Logger } from './index.ts';

/** A logger whose lines are collected as parsed JSON. */
export function createCapturingLogger(name: string): {
  logger: Logger;
  lines: Record<string, unknown>[];
} {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(String(chunk)));
      callback();
    },
  });

  return { logger: createLogger({ name, destination }), lines };
}
