import { createBaseApp } from '@fphd/express';

/**
 * If no publication sweep has ended for this long, the sweep loop is treated as hung. The `/livez`
 * probe then answers 503, which asks the platform to restart the worker.
 */
export const STALLED_AFTER_MS = 5 * 60_000;

/**
 * The worker's Express app. Its only routes are the `/livez` and `/readyz` probes, and `/livez`
 * fails once no sweep has ended for `STALLED_AFTER_MS`.
 */
export function createApp({ lastSweepCompletedAt }: { lastSweepCompletedAt: () => number }) {
  return createBaseApp({
    serviceName: 'internal-worker',
    isLive: () => Date.now() - lastSweepCompletedAt() < STALLED_AFTER_MS,
  });
}
