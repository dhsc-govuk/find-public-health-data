import type { Server } from 'node:http';

import gracefulShutdown from 'http-graceful-shutdown';

/** Cleanup releases the handles holding the process open, so it must not be the phase that
 * gets nothing. Capped as a share so a short budget shortens the reserve rather than being
 * eaten by it. */
const CLEANUP_RESERVE_MS = 2_000;
const CLEANUP_RESERVE_SHARE = 0.2;

/** The library polls in these steps, and reads a falsy timeout as "destroy everything now". */
const CLOSE_POLL_STEP_MS = 250;

/** Held back from the library's timeout: it counts in 250ms hops that each slip with the event
 * loop, by seconds on a loaded process. */
const CLOSE_DRIFT_SHARE = 0.2;

const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

export interface ShutdownOptions {
  /** The whole stop, drain included. Keep it under the platform's own grace period. */
  gracePeriodMs: number;
  drainDelayMs: number;
  /** The first signal arrived. Runs before anything else in the stop. */
  onStopping?: ((signal: NodeJS.Signals, budgets: StopBudgets) => void) | undefined;
  onDraining?: (() => void) | undefined;
  /** The budget ran out. Not a failure, so it leaves the exit code alone. */
  onForcedClose?: (() => void) | undefined;
  /** Database pools and other handles. Runs even when the close failed. */
  onShutdown?: ((signal: NodeJS.Signals) => void | Promise<void>) | undefined;
  onError?: ((error: unknown) => void) | undefined;
}

interface PhaseBudgets {
  drainMs: number;
  closeMs: number;
  /** What the library is told, under `closeMs` so its poll loop can slip and still finish. */
  closeTimeoutMs: number;
  reserveMs: number;
}

/** The whole budget and its split, as a stop starts. */
export interface StopBudgets {
  gracePeriodMs: number;
  drainMs: number;
  closeMs: number;
  reserveMs: number;
}

/** The close takes its share before the drain does: left as the remainder it reaches zero. */
export function phaseBudgets(gracePeriodMs: number, drainDelayMs: number): PhaseBudgets {
  const reserveMs = Math.min(CLEANUP_RESERVE_MS, gracePeriodMs * CLEANUP_RESERVE_SHARE);
  const closeMs = Math.max(CLOSE_POLL_STEP_MS, gracePeriodMs - drainDelayMs - reserveMs);
  const closeTimeoutMs = Math.max(CLOSE_POLL_STEP_MS, closeMs * (1 - CLOSE_DRIFT_SHARE));
  const drainMs = Math.max(0, Math.min(drainDelayMs, gracePeriodMs - reserveMs - closeMs));

  return { drainMs, closeMs, closeTimeoutMs, reserveMs };
}

class DeadlineExceeded extends Error {}

/** The timer is not `unref`'d: it is the only thing left guaranteeing an exit code. */
function withDeadline(work: Promise<void>, timeoutMs: number, phase: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const expiry = setTimeout(
      () => reject(new DeadlineExceeded(`Shutdown ${phase} did not finish within ${timeoutMs}ms`)),
      timeoutMs,
    );

    void work.then(resolve, reject).finally(() => clearTimeout(expiry));
  });
}

/**
 * Drain, close and cleanup sharing one budget. Resolves to the exit code the process should use,
 * and is safe to call more than once.
 *
 * **Call it before the server takes any traffic**: the library learns about connections from a
 * listener attached here, so a socket that already exists is invisible to it.
 */
export function createShutdownHandler(
  server: Server,
  {
    gracePeriodMs,
    drainDelayMs,
    onStopping,
    onDraining,
    onForcedClose,
    onShutdown,
    onError,
  }: ShutdownOptions,
): (signal: NodeJS.Signals) => Promise<number> {
  const { drainMs, closeMs, closeTimeoutMs, reserveMs } = phaseBudgets(gracePeriodMs, drainDelayMs);
  let drainFailure: unknown;

  const closeHttpServer = gracefulShutdown(server, {
    // Its own handler exits on a repeated signal, losing the cleanup that releases the pool.
    signals: '',
    // The exit code is decided below, once cleanup has had its turn.
    forceExit: false,
    // Its development mode exits before the Vite server is closed.
    development: false,
    timeout: closeTimeoutMs,
    // The drain: still listening and still serving.
    preShutdown: async () => {
      try {
        onDraining?.();
      } catch (error) {
        // A rejected preShutdown short-circuits the library before it closes the server.
        drainFailure = error;
      }
      await new Promise((resolve) => setTimeout(resolve, drainMs));
    },
  });

  let inProgress: Promise<number> | undefined;

  return (signal) => {
    inProgress ??= (async () => {
      const expiresAt = Date.now() + gracePeriodMs;
      const remaining = () => Math.max(0, expiresAt - Date.now());
      const failures: unknown[] = [];

      // Caught so that a failure to report the stop cannot skip it.
      try {
        onStopping?.(signal, { gracePeriodMs, drainMs, closeMs, reserveMs });
      } catch (error) {
        failures.push(error);
      }

      try {
        // The library's timeout covers its wait for idle connections, not the close itself, which
        // goes on waiting for any socket it never saw.
        const closeBy = Math.max(CLOSE_POLL_STEP_MS, remaining() - reserveMs);
        await withDeadline(closeHttpServer(), closeBy, 'close');
      } catch (error) {
        server.closeAllConnections();
        // Spending the budget is not failing.
        if (error instanceof DeadlineExceeded) onForcedClose?.();
        else failures.push(error);
      }

      if (drainFailure !== undefined) failures.push(drainFailure);

      if (onShutdown !== undefined) {
        try {
          const cleanup = Promise.resolve(onShutdown(signal));
          await withDeadline(cleanup, Math.max(remaining(), reserveMs), 'cleanup');
        } catch (error) {
          failures.push(error);
        }
      }

      for (const failure of failures) onError?.(failure);
      return failures.length === 0 ? 0 : 1;
    })();

    return inProgress;
  };
}

/**
 * Without a handler the kernel discards a default-action signal sent to PID 1, so a containerised
 * app would ignore the stop and wait to be killed. `process.exit` because by then anything still
 * holding the loop open is what would delay the exit.
 */
export function installShutdownHandlers(server: Server, options: ShutdownOptions): void {
  const shutdown = createShutdownHandler(server, options);

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, (received) => {
      // The rejection branch covers a throwing `onError`.
      void shutdown(received).then(
        (code) => process.exit(code),
        () => process.exit(1),
      );
    });
  }
}
