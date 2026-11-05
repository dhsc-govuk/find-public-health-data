import { loadConfig } from './load-config.ts';

// Parses the real environment once, at import, so a misconfigured process fails at startup.
// Import as `import * as config from './config.ts'`.
export const { host, port, revision, log, db, shutdown } = loadConfig(process.env);
