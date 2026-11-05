import { createDb } from '@fphd/db';

import * as config from './config.ts';

// Connects as the internal_api role, or as the worker's principal in it.
export const db = createDb(config.db);
