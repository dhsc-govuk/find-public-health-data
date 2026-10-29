import { type Database, schema } from '@fphd/db';
import { type Actor, changesBetween, listChanges, recordAudit } from '@fphd/db/audit-log';
import { countDistinct, eq, sql } from 'drizzle-orm';

import type { EditPrecondition } from './edit-version.ts';
import { violatesConstraint } from './indicator-repository-sql.ts';

const { indicatorVersion, indicatorVersionTopic, subtopic, topic } = schema;

/** A topic row with its writers, which only the internal surface reads. */
export type TopicRow = typeof topic.$inferSelect;

/** Writes address a topic by id rather than slug, because the slug is itself editable. */
export async function getTopicById(db: Database, id: string): Promise<TopicRow | undefined> {
  const rows = await db.select().from(topic).where(eq(topic.id, id));
  return rows[0];
}

export type TopicUpdate = Pick<TopicRow, 'description' | 'slug' | 'title'>;

export type CreateTopicResult = { ok: true; topic: TopicRow } | { ok: false; reason: 'slug_taken' };

export type UpdateTopicResult =
  | { ok: true; topic: TopicRow; changed: boolean }
  | { ok: false; reason: 'not_found' | 'slug_taken' }
  | { ok: false; reason: 'changed'; version: string };

export type DeleteTopicResult = { ok: true } | { ok: false; reason: 'not_found' | 'in_use' };

const UNIQUE_VIOLATION = '23505';

/** Drizzle wraps the driver error, so the SQLSTATE is on a `cause` rather than the error thrown. */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current !== null && current !== undefined; ) {
    if (typeof current !== 'object') return false;
    if ('code' in current && (current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

/** Indicators with any version, draft or published, linked to the topic: what blocks a delete. */
export async function countLinkedIndicators(db: Database, id: string): Promise<number> {
  const [row] = await db
    .select({ count: countDistinct(indicatorVersion.indicatorId) })
    .from(indicatorVersionTopic)
    .innerJoin(indicatorVersion, eq(indicatorVersion.id, indicatorVersionTopic.indicatorVersionId))
    .where(eq(indicatorVersionTopic.topicId, id));

  return row?.count ?? 0;
}

function matches(current: TopicRow, update: TopicUpdate): boolean {
  return (
    current.slug === update.slug &&
    current.title === update.title &&
    current.description === update.description
  );
}

/**
 * The row lock makes the version and unchanged checks safe: without it two concurrent saves
 * both read the old row, and the later one overwrites the earlier as a change. A topic whose
 * version is no longer the one the save was shown is refused as `changed`, with the version
 * it has now.
 */
export async function updateTopic(
  db: Database,
  id: string,
  { description, slug, title }: TopicUpdate,
  actor: Actor,
  precondition?: EditPrecondition<TopicRow>,
): Promise<UpdateTopicResult> {
  const update = { description, slug, title };

  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx.select().from(topic).where(eq(topic.id, id)).for('update');

      if (current === undefined) return { ok: false, reason: 'not_found' };

      if (precondition !== undefined) {
        const version = precondition.versionOf(current);
        if (version !== precondition.version) return { ok: false, reason: 'changed', version };
      }

      if (matches(current, update)) return { ok: true, topic: current, changed: false };

      // Named columns only: the id and creation timestamp stay the database's to set.
      const [updated] = await tx
        .update(topic)
        .set({
          ...update,
          // JS consumers observe millisecond timestamps; a save in the same millisecond
          // still needs a later revision time.
          updatedAt: sql`greatest(now(), ${topic.updatedAt} + interval '1 millisecond')`,
          updatedBy: actor.userId,
        })
        .where(eq(topic.id, id))
        .returning();

      if (updated === undefined) {
        // The row is locked, so a miss means the update matched something other than the row read.
        throw new Error(`updateTopic locked topic ${id} but updated no row`);
      }

      await recordAudit(tx, actor, [
        { action: 'topic.updated', entityId: id, changes: changesBetween(current, updated) },
      ]);

      return { ok: true, topic: updated, changed: true };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'slug_taken' };
    throw error;
  }
}

/** The database mints the id (UUIDv7) and both timestamps. */
export async function createTopic(
  db: Database,
  { description, slug, title }: TopicUpdate,
  actor: Actor,
): Promise<CreateTopicResult> {
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(topic)
        .values({ description, slug, title, createdBy: actor.userId, updatedBy: actor.userId })
        .returning();

      if (created === undefined) throw new Error('createTopic inserted no row');

      await recordAudit(tx, actor, [
        { action: 'topic.created', entityId: created.id, changes: changesBetween(null, created) },
      ]);

      return { ok: true, topic: created };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'slug_taken' };
    throw error;
  }
}

/** The foreign key from `indicator_version_topic` refuses a linked topic, publications included. */
export async function deleteTopic(
  db: Database,
  id: string,
  actor: Actor,
): Promise<DeleteTopicResult> {
  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: topic.id })
        .from(topic)
        .where(eq(topic.id, id))
        .for('update');
      if (current === undefined) return { ok: false, reason: 'not_found' };
      const subtopics = await tx
        .select({ id: subtopic.id })
        .from(subtopic)
        .where(eq(subtopic.topicId, id));
      const [deleted] = await tx.delete(topic).where(eq(topic.id, id)).returning();

      await recordAudit(tx, actor, [
        {
          action: 'topic.deleted',
          entityId: id,
          changes: {
            ...changesBetween(deleted ?? null, null),
            ...(subtopics.length
              ? listChanges({ subtopicIds: subtopics.map(({ id }) => id) }, { subtopicIds: [] })
              : {}),
          },
        },
      ]);

      return { ok: true };
    });
  } catch (error) {
    if (violatesConstraint(error, 'indicator_version_topic_topic_fk'))
      return { ok: false, reason: 'in_use' };
    throw error;
  }
}
