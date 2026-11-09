import { loadConfig } from './load-config.ts';

// Parses process.env once, when this module is first imported, so a misconfigured worker fails
// at start-up rather than at its first sweep. Import as `import * as config from './config.ts'`.
export const { host, port, revision, log, db, shutdown } = loadConfig(process.env);
