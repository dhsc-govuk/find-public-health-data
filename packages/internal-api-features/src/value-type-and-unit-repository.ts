import { type Database, schema } from '@fphd/db';
import { asc } from 'drizzle-orm';

import type { ValueTypeAndUnitOptions } from './contract.ts';

const { valueType } = schema;

/** Every value type, in the order the publisher's form lists them. */
export async function listValueTypeAndUnitOptions(db: Database): Promise<ValueTypeAndUnitOptions> {
  const valueTypes = await db
    .select({ id: valueType.id, name: valueType.name })
    .from(valueType)
    .orderBy(asc(valueType.position), asc(valueType.name));

  return { valueTypes };
}
