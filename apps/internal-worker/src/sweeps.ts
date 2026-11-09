import type { PublicationSweep } from '@fphd/internal-workflow';
import type { Logger } from '@fphd/logger';

const MINUTE_MS = 60_000;

// Publication times fall on whole minutes. Each sweep starts one second after a minute boundary,
// so a version due on that minute is already due even if the database server's clock, which
// decides what is due, runs slightly behind this process's clock.
const AFTER_BOUNDARY_MS = 1_000;

/**
 * How long a sweep keeps starting to publish versions. Once this has passed, the sweep finishes the
 * version it is on and ends, and any versions still due wait for the next sweep.
 */
export const SWEEP_BUDGET_MS = 50_000;

/**
 * The start time of the first sweep after `now`. That is the next time that falls one second past
 * a minute boundary.
 */
export function nextSweepAt(now: number): number {
  return (Math.floor((now - AFTER_BOUNDARY_MS) / MINUTE_MS) + 1) * MINUTE_MS + AFTER_BOUNDARY_MS;
}

export interface Sweeps {
  /**
   * When the last sweep ended, whether it succeeded or threw. Before any sweep has ended, it is
   * when `startSweeps` was called.
   */
  lastCompletedAt: () => number;
  /**
   * Stops scheduling sweeps, and tells a sweep that is running to publish no more versions after
   * the one it is on. The returned promise resolves once that sweep has ended.
   */
  stop: () => Promise<void>;
}

/**
 * Runs a publication sweep straight away, then at each start time `nextSweepAt` gives. Only one
 * sweep runs at a time, so a start time that comes while a sweep is still running is skipped. A
 * sweep that throws is logged as failed, and the next sweep runs as usual.
 *
 * Each sweep is given a `shouldStop` callback. It returns true once the sweep has run for
 * `SWEEP_BUDGET_MS` or `stop` has been called, and the sweep then publishes no more versions after
 * the one it is on.
 */
export function startSweeps({
  sweep,
  logger,
}: {
  sweep: (shouldStop: () => boolean) => Promise<PublicationSweep>;
  logger: Logger;
}): Sweeps {
  let lastCompletedAt = Date.now();
  let inFlight: Promise<void> | undefined;
  let timer: NodeJS.Timeout | undefined;
  let stopping = false;

  async function sweepOnce(): Promise<void> {
    const startedAt = Date.now();
    const shouldStop = () => stopping || Date.now() - startedAt >= SWEEP_BUDGET_MS;
    try {
      const counts = await sweep(shouldStop);
      logger.info({ ...counts, durationMs: Date.now() - startedAt }, 'Publication sweep');
    } catch (error) {
      logger.error({ err: error, durationMs: Date.now() - startedAt }, 'Publication sweep failed');
    } finally {
      lastCompletedAt = Date.now();
    }
  }

  function run(): void {
    if (inFlight !== undefined) return;
    inFlight = sweepOnce().finally(() => {
      inFlight = undefined;
    });
  }

  function schedule(): void {
    const now = Date.now();
    timer = setTimeout(() => {
      schedule();
      run();
    }, nextSweepAt(now) - now);
  }

  run();
  schedule();

  return {
    lastCompletedAt: () => lastCompletedAt,
    stop: async () => {
      stopping = true;
      clearTimeout(timer);
      await inFlight;
    },
  };
}
