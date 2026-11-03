import { loadConfig } from './load-config.ts';

// Parses the real environment once, at import — a misconfigured process fails here, at
// startup. Import as `import * as config from './config.ts'`.
export const { appEnv, host, port, revision, log, db, session, shutdown, storage } = loadConfig(
  process.env,
);
