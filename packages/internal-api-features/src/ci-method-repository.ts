import { type Database, schema } from '@fphd/db';
import { asc, eq } from 'drizzle-orm';

const { ciMethod } = schema;

const columns = {
  id: ciMethod.id,
  name: ciMethod.name,
  kind: ciMethod.kind,
};

export type CiMethodRow = Pick<typeof ciMethod.$inferSelect, keyof typeof columns>;

/** Every confidence interval method, in the order the publisher's form lists them. */
export async function listCiMethods(db: Database): Promise<CiMethodRow[]> {
  return db.select(columns).from(ciMethod).orderBy(asc(ciMethod.name));
}

export async function getCiMethodById(db: Database, id: string): Promise<CiMethodRow | undefined> {
  const rows = await db.select(columns).from(ciMethod).where(eq(ciMethod.id, id));

  return rows[0];
}
