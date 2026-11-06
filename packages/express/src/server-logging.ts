import type { Logger } from '@fphd/logger';

import type { StopBudgets } from './shutdown.ts';

interface ServerLoggingOptions {
  port: number;
  /** The commit the image was built from. */
  revision: string;
  onShutdown?: (() => void | Promise<void>) | undefined;
}

interface ServerLogging {
  onListening: () => void;
  onListenError: (error: Error) => void;
  onStopping: (signal: NodeJS.Signals, budgets: StopBudgets) => void;
  onShutdown: (signal: NodeJS.Signals) => Promise<void>;
  onForcedClose: () => void;
  onError: (error: unknown) => void;
}

/** The lifecycle callbacks, identical in every server. Nothing here names the app — the logger
 * already binds that to every line. */
export function serverLogging(
  logger: Logger,
  { port, revision, onShutdown }: ServerLoggingOptions,
): ServerLogging {
  return {
    onListening: () => logger.info({ port, revision }, 'Listening'),
    onListenError: (error) => logger.fatal({ err: error, port }, 'Could not listen'),
    // Without it, a drain and a hang look the same until Stopped.
    onStopping: (signal, budgets) => logger.info({ signal, ...budgets }, 'Stopping'),
    onShutdown: async (signal) => {
      await onShutdown?.();
      logger.info({ signal }, 'Stopped');
    },
    onForcedClose: () => logger.warn('Ran out of time to close, so requests were cut short'),
    onError: (error) => logger.fatal({ err: error }, 'Did not stop cleanly'),
  };
}
