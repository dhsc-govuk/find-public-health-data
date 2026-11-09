import { createDb } from '@fphd/db';

import * as config from './config.ts';

// Connects as the internal_api role with its password. Under DB_AUTH=entra it connects instead as
// the worker's own Entra principal, which is a member of internal_api.
export const db = createDb(config.db);
