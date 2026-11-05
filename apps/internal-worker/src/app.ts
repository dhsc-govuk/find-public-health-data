import { createBaseApp } from '@fphd/express';

/** With no sweep ended for this long the loop has hung, and /livez asks for a restart. */
export const STALLED_AFTER_MS = 5 * 60_000;

/** The probes, the only routes the worker serves. */
export function createApp({ lastSweepCompletedAt }: { lastSweepCompletedAt: () => number }) {
  return createBaseApp({
    serviceName: 'internal-worker',
    isLive: () => Date.now() - lastSweepCompletedAt() < STALLED_AFTER_MS,
  });
}
