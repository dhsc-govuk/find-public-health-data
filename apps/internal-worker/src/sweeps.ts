import type { PublicationSweep } from '@fphd/internal-workflow';
import type { Logger } from '@fphd/logger';

const MINUTE_MS = 60_000;

// Publication times are whole minutes. The second absorbs a database clock running behind ours.
const AFTER_BOUNDARY_MS = 1_000;

/** How long a sweep goes on taking versions; the rest wait for the next boundary. */
export const SWEEP_BUDGET_MS = 50_000;

/** When the next sweep after `now` starts: one second past the next minute boundary. */
export function nextSweepAt(now: number): number {
  return (Math.floor((now - AFTER_BOUNDARY_MS) / MINUTE_MS) + 1) * MINUTE_MS + AFTER_BOUNDARY_MS;
}

export interface Sweeps {
  /** When the last sweep ended, or when the sweeps started if none has ended yet. */
  lastCompletedAt: () => number;
  /**
   * Schedules no more sweeps, has the sweep in flight take no version after its current one, and
   * resolves once that sweep ends.
   */
  stop: () => Promise<void>;
}

/**
 * Sweeps once now, then at each `nextSweepAt`. One sweep runs at a time: a boundary reached while
 * one is still running is skipped. A sweep that throws is logged, and the next runs as usual. A
 * sweep is told to stop taking versions once `SWEEP_BUDGET_MS` has passed, or the sweeps are
 * stopping.
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
