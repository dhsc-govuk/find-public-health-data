import type { SqlClient } from '@fphd/db';
import { migrateToLatest } from '@fphd/db-operations';
import type { Logger } from '@fphd/logger';

import {
  bootstrap,
  importCoreData,
  importPublishedSnapshot,
  migrateLiveData,
  rebuildReadModels,
  reset,
  seedDummyData,
  status,
} from './db-commands.ts';
import type { Config } from './load-config.ts';

/**
 * The capabilities a command may use, passed whole rather than as positional arguments, so
 * adding one does not change every command's signature.
 */
export interface CommandContext {
  sql: SqlClient;
  config: Config;
  logger: Logger;
}

export interface Command {
  description: string;
  run(context: CommandContext): Promise<void>;
}

/**
 * Keyed by the whole command line rather than nested by group, so the registry is also the
 * list of what can be run — `db` is the first group of several this image is expected to
 * grow, and a flat map keeps adding one to a single place.
 */
export const commands: Record<string, Command> = {
  'db bootstrap': {
    description: 'Create the owner group and the per-API login roles, resetting passwords',
    run: bootstrap,
  },
  'db migrate': {
    description: 'Apply every pending migration',
    run: ({ sql }) => migrateToLatest(sql),
  },
  'db status': {
    description: 'Report the state of every migration, and fail if one blocks migrating',
    run: status,
  },
  'db import-core-data': {
    description: 'Load the required core data (topics) — idempotent, any environment',
    run: importCoreData,
  },
  'db seed-dummy-data': {
    description: 'Replace all dummy data with the committed seed, then rebuild the read models',
    run: seedDummyData,
  },
  'db import-published-snapshot': {
    description: 'Replace dev data with the approved-only published benchmark snapshot',
    run: importPublishedSnapshot,
  },
  'db migrate-live-data': {
    description: 'Apply an ordered approved-live baseline or incremental migration package',
    run: migrateLiveData,
  },
  'db rebuild-read-models': {
    description: 'Rebuild the read models from the published views',
    run: rebuildReadModels,
  },
  'db reset': {
    description:
      'Reset the database to its freshly created state so `db migrate` rebuilds from empty',
    run: reset,
  },
};

export class UsageError extends Error {}

export function usage(): string {
  const width = Math.max(...Object.keys(commands).map((name) => name.length));
  const lines = Object.entries(commands).map(
    ([name, { description }]) => `  ${name.padEnd(width)}  ${description}`,
  );

  return ['Usage: operations <command>', '', 'Commands:', ...lines].join('\n');
}

export function resolveCommand(argv: readonly string[]): Command {
  const requested = argv.join(' ');
  const command = commands[requested];

  if (command === undefined) {
    throw new UsageError(requested === '' ? 'No command given' : `Unknown command: ${requested}`);
  }

  return command;
}
