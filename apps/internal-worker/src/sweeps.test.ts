import type { PublicationSweep } from '@fphd/internal-workflow';
import type { Logger } from '@fphd/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nextSweepAt, SWEEP_BUDGET_MS, type Sweeps, startSweeps } from './sweeps.ts';

const at = (time: string) => new Date(`2026-11-05T${time}Z`).getTime();

const counts: PublicationSweep = { published: 1, failed: 0, blocked: false, overdue: 0 };

function stubLogger() {
  return { info: vi.fn(), error: vi.fn() } as unknown as Logger;
}

/** A sweep whose every call stays in flight until the test finishes the calls made so far. */
function heldSweep() {
  let pending: ((value: PublicationSweep) => void)[] = [];
  const sweep = vi.fn(
    () =>
      new Promise<PublicationSweep>((resolve) => {
        pending = [...pending, resolve];
      }),
  );
  const finish = () => {
    for (const resolve of pending) resolve(counts);
    pending = [];
  };
  return { sweep, finish };
}

/** A sweep that publishes one of `versions` every 20 seconds until it is told to stop. */
function versionsSweep(versions: number) {
  return vi.fn(async (shouldStop: () => boolean): Promise<PublicationSweep> => {
    let published = 0;
    while (published < versions && !shouldStop()) {
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      published += 1;
    }
    return { ...counts, published };
  });
}

describe('nextSweepAt', () => {
  it('is one second past the next minute boundary', () => {
    expect(nextSweepAt(at('09:29:30.000'))).toBe(at('09:30:01.000'));
    expect(nextSweepAt(at('09:30:00.000'))).toBe(at('09:30:01.000'));
    expect(nextSweepAt(at('09:30:00.999'))).toBe(at('09:30:01.000'));
  });

  it('moves to the next minute once that second has come', () => {
    expect(nextSweepAt(at('09:30:01.000'))).toBe(at('09:31:01.000'));
    expect(nextSweepAt(at('09:30:59.999'))).toBe(at('09:31:01.000'));
  });
});

describe('startSweeps', () => {
  let sweeps: Sweeps | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at('09:29:30.000'));
  });

  afterEach(async () => {
    await sweeps?.stop();
    sweeps = undefined;
    vi.useRealTimers();
  });

  it('sweeps at start, then one second past each minute boundary', async () => {
    const sweep = vi.fn(async () => counts);
    sweeps = startSweeps({ sweep, logger: stubLogger() });
    await vi.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(at('09:30:01.000') - at('09:29:30.000') - 1);
    expect(sweep).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sweep).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sweep).toHaveBeenCalledTimes(3);
  });

  it('logs each sweep with its counts and duration', async () => {
    const logger = stubLogger();
    const { sweep, finish } = heldSweep();
    sweeps = startSweeps({ sweep, logger });

    await vi.advanceTimersByTimeAsync(1_500);
    finish();
    await vi.advanceTimersByTimeAsync(0);

    expect(logger.info).toHaveBeenCalledWith({ ...counts, durationMs: 1_500 }, 'Publication sweep');
  });

  it('skips a boundary reached while a sweep is still running', async () => {
    const { sweep, finish } = heldSweep();
    sweeps = startSweeps({ sweep, logger: stubLogger() });

    await vi.advanceTimersByTimeAsync(at('09:30:01.000') - at('09:29:30.000'));
    expect(sweep).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sweep).toHaveBeenCalledTimes(2);
    finish();
  });

  it('logs a sweep that throws, and still runs the next', async () => {
    const logger = stubLogger();
    const failure = new Error('connection refused');
    const sweep = vi.fn<() => Promise<PublicationSweep>>().mockRejectedValueOnce(failure);
    sweep.mockResolvedValue(counts);
    sweeps = startSweeps({ sweep, logger });

    await vi.advanceTimersByTimeAsync(0);
    expect(logger.error).toHaveBeenCalledWith(
      { err: failure, durationMs: 0 },
      'Publication sweep failed',
    );

    await vi.advanceTimersByTimeAsync(at('09:30:01.000') - at('09:29:30.000'));
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith({ ...counts, durationMs: 0 }, 'Publication sweep');
  });

  it('records a sweep that throws as ended', async () => {
    const sweep = vi.fn(
      () =>
        new Promise<PublicationSweep>((_resolve, reject) => {
          setTimeout(() => reject(new Error('connection refused')), 2_000);
        }),
    );
    sweeps = startSweeps({ sweep, logger: stubLogger() });

    await vi.advanceTimersByTimeAsync(2_000);

    expect(sweeps.lastCompletedAt()).toBe(at('09:29:32.000'));
  });

  it('stops taking versions once the budget has passed, leaving the rest for the next sweep', async () => {
    const logger = stubLogger();
    const sweep = versionsSweep(5);
    const running = startSweeps({ sweep, logger });

    // Versions end at 20, 40 and 60 seconds; the budget has passed by the third.
    expect(SWEEP_BUDGET_MS).toBe(50_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(logger.info).toHaveBeenCalledWith(
      { ...counts, published: 3, durationMs: 60_000 },
      'Publication sweep',
    );

    // The 09:30:01 boundary came mid-sweep, so the next is at 09:31:01.
    await vi.advanceTimersByTimeAsync(at('09:31:01.000') - at('09:30:30.000') - 1);
    expect(sweep).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sweep).toHaveBeenCalledTimes(2);

    const stopping = running.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    await stopping;
  });

  it('records when the last sweep ended, starting from when the sweeps started', async () => {
    const { sweep, finish } = heldSweep();
    sweeps = startSweeps({ sweep, logger: stubLogger() });
    expect(sweeps.lastCompletedAt()).toBe(at('09:29:30.000'));

    await vi.advanceTimersByTimeAsync(2_000);
    expect(sweeps.lastCompletedAt()).toBe(at('09:29:30.000'));
    finish();
    await vi.advanceTimersByTimeAsync(0);

    expect(sweeps.lastCompletedAt()).toBe(at('09:29:32.000'));
  });

  it('waits on stop for the sweep in flight, then sweeps no more', async () => {
    const { sweep, finish } = heldSweep();
    const running = startSweeps({ sweep, logger: stubLogger() });
    let stopped = false;

    const stopping = running.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);

    finish();
    await stopping;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  it('has the sweep in flight end after its current version once stopped', async () => {
    const logger = stubLogger();
    const sweep = versionsSweep(5);
    const running = startSweeps({ sweep, logger });
    let stopped = false;

    await vi.advanceTimersByTimeAsync(10_000);
    const stopping = running.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await stopping;

    expect(stopped).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      { ...counts, published: 1, durationMs: 20_000 },
      'Publication sweep',
    );
  });
});
