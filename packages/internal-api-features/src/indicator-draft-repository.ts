import { type Database, schema } from '@fphd/db';
import { type Actor, changesBetween, listChanges, recordAudit } from '@fphd/db/audit-log';
import { slugify, slugProblem } from '@fphd/utils/slug';
import { and, eq, sql } from 'drizzle-orm';

import type {
  CiMethodKind,
  DraftStatus,
  DraftSubmissionStatus,
  IndicatorStatus,
} from './contract.ts';
import type { EditPrecondition } from './edit-version.ts';
import {
  draftJoin,
  draftStatus,
  draftSubmissionStatus,
  draftVersion,
  EXCLUSION_VIOLATION,
  hasSqlState,
  indicatorStatus,
  publishedJoin,
  publishedVersion,
  publishedVersionJoin,
  type Transaction,
} from './indicator-repository-sql.ts';
import {
  ageRangesOf,
  classificationsOf,
  type IndicatorDraftAgeRange,
  type IndicatorDraftClassification,
  type IndicatorDraftLink,
  type IndicatorDraftLists,
  type IndicatorDraftSources,
  type IndicatorDraftTaxonomy,
  linksOf,
  replaceLists,
  sourcesOf,
  taxonomyOf,
  UNORDERED_LISTS,
} from './indicator-version-lists-repository.ts';

const { ciMethod, currentPublishedVersion, indicator, indicatorVersion } = schema;

/** Every column of one version, as a section reads its answers from the draft. */
export type IndicatorDraftVersion = typeof indicatorVersion.$inferSelect;

/** A draft as the sections read it: its columns, and the lists held in tables of their own. */
export type IndicatorDraft = IndicatorDraftVersion &
  IndicatorDraftSources &
  IndicatorDraftTaxonomy & {
    links: IndicatorDraftLink[];
    ageRanges: IndicatorDraftAgeRange[];
    /** Ordered by title, as the tagging page lists them. */
    topicIds: string[];
    /** Ordered by name, as the tagging page lists them. */
    classifications: IndicatorDraftClassification[];
  };

export interface IndicatorDraftStateRow {
  id: string;
  shortId: number;
  teamId: string | null;
  /** The draft a publisher is working on, absent while the indicator has none. */
  draft: IndicatorDraft | null;
  /** What the draft's CI method asks for, which the task list needs to judge its answers. */
  draftCiMethodKind: CiMethodKind | null;
  indicatorStatus: IndicatorStatus;
  draftStatus: DraftStatus | null;
  draftSubmissionStatus: DraftSubmissionStatus | null;
}

/** The draft and the indicator's two statuses, which is what a task list is derived from. */
export async function getIndicatorDraftState(
  db: Database,
  id: string,
): Promise<IndicatorDraftStateRow | undefined> {
  const [row] = await db
    .select({
      id: indicator.id,
      shortId: indicator.shortId,
      teamId: indicator.teamId,
      draft: draftVersion,
      draftCiMethodKind: ciMethod.kind,
      indicatorStatus,
      draftStatus,
      draftSubmissionStatus,
    })
    .from(indicator)
    .leftJoin(draftVersion, draftJoin)
    .leftJoin(ciMethod, eq(ciMethod.id, draftVersion.ciMethodId))
    .leftJoin(currentPublishedVersion, publishedJoin)
    .where(eq(indicator.id, id));

  if (row === undefined) return undefined;

  const { draft, ...state } = row;

  if (draft === null) return { ...state, draft: null };

  return { ...state, draft: { ...draft, ...(await draftListsOf(db, draft.id)) } };
}

/** The published version as the sections read a draft, or undefined while none is published. */
export async function getIndicatorPublishedVersion(
  db: Database,
  id: string,
): Promise<IndicatorDraft | undefined> {
  const [row] = await db
    .select({ version: publishedVersion })
    .from(currentPublishedVersion)
    .innerJoin(publishedVersion, publishedVersionJoin)
    .where(eq(currentPublishedVersion.indicatorId, id));

  if (row === undefined) return undefined;

  return { ...row.version, ...(await draftListsOf(db, row.version.id)) };
}

/** The lists a draft holds in tables of its own, as the sections read them. */
export async function draftListsOf(
  db: Database | Transaction,
  draftId: string,
): Promise<Omit<IndicatorDraft, keyof IndicatorDraftVersion>> {
  const [links, ageRanges, taxonomy, classifications, sources] = await Promise.all([
    linksOf(db, draftId),
    ageRangesOf(db, draftId),
    taxonomyOf(db, draftId),
    classificationsOf(db, draftId),
    sourcesOf(db, draftId),
  ]);

  return { ...sources, ...taxonomy, links, ageRanges, classifications };
}

/**
 * The version columns a publisher edits: not the identity, the status or the audit trail,
 * and not the slug, which is derived from the name until the indicator is first published
 * and then stays as the public address.
 */
type EditableVersionColumns = Omit<
  typeof indicatorVersion.$inferInsert,
  | 'createdAt'
  | 'createdBy'
  | 'id'
  | 'indicatorId'
  | 'isLocked'
  | 'publishedAt'
  | 'slug'
  | 'status'
  | 'updatedAt'
  | 'updatedBy'
>;

/** An update rewrites the columns it names, so every one of them is optional. */
export type IndicatorDraftAttributes = Partial<EditableVersionColumns>;

/** A new draft comes from the page that asks for a name, so it always has one. */
export type NewIndicatorDraftAttributes = IndicatorDraftAttributes &
  Pick<EditableVersionColumns, 'name'>;

export interface CreatedIndicatorDraft {
  indicatorId: string;
  shortId: number;
  versionId: string;
}

export type CreateIndicatorDraftResult =
  | ({ ok: true } & CreatedIndicatorDraft)
  | { ok: false; reason: 'slug_taken' };

export type UpdateIndicatorDraftResult =
  | { ok: true }
  | { ok: false; reason: 'no_draft' | 'locked' | 'slug_taken' }
  | { ok: false; reason: 'changed'; version: string };

// Scopes the slug locks within the two-key advisory lock space; no other lock uses this first key.
export const SLUG_LOCK_NAMESPACE = 0x736c7567; // 'slug'

/**
 * The slug a draft takes. The name page refuses a name that yields none, so reaching this
 * with one is a bug rather than a submission to report.
 */
function draftSlug(name: string): string {
  const problem = slugProblem(name);

  if (problem !== undefined) {
    throw new Error(`Indicator name yields no usable slug (${problem}): ${name}`);
  }

  return slugify(name);
}

/** A new indicator is an identity in a team and a draft version; the database mints both ids. */
export async function createIndicatorDraft(
  db: Database,
  attributes: NewIndicatorDraftAttributes,
  actor: Actor,
  teamId: string,
): Promise<CreateIndicatorDraftResult> {
  const slug = draftSlug(attributes.name);

  try {
    return await db.transaction(async (tx) => {
      await lockSlugs(tx, [slug]);

      const [identity] = await tx
        .insert(indicator)
        .values({ teamId })
        .returning({ id: indicator.id, shortId: indicator.shortId });

      if (identity === undefined) throw new Error('createIndicatorDraft inserted no indicator');

      const [version] = await tx
        .insert(indicatorVersion)
        .values({
          ...attributes,
          slug,
          indicatorId: identity.id,
          status: 'draft',
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })
        .returning();

      if (version === undefined) throw new Error('createIndicatorDraft inserted no version');

      await recordAudit(tx, actor, [
        {
          action: 'indicator.draft_created',
          entityId: identity.id,
          changes: { ...changesBetween(null, version), ...changesBetween(null, { teamId }) },
        },
      ]);

      return {
        ok: true,
        indicatorId: identity.id,
        shortId: identity.shortId,
        versionId: version.id,
      };
    });
  } catch (error) {
    if (hasSqlState(error, EXCLUSION_VIOLATION)) return { ok: false, reason: 'slug_taken' };
    throw error;
  }
}

/**
 * Rewrites a draft's columns and, when given, its lists. Lists are replaced rather than
 * merged: the submission states what is true now. A renamed draft is
 * re-slugged only while nothing is published: once an indicator has a public address,
 * every version keeps it, so a rename never moves the page. Returns `locked` if the draft is
 * locked for review. Returns `changed`, with the current version, if the draft has changed
 * since the form was shown.
 */
export async function updateIndicatorDraft(
  db: Database,
  indicatorId: string,
  attributes: IndicatorDraftAttributes,
  lists: IndicatorDraftLists,
  actor: Actor,
  precondition?: EditPrecondition<IndicatorDraft>,
): Promise<UpdateIndicatorDraftResult> {
  try {
    return await db.transaction(async (tx) => {
      // The name is checked whether or not the slug it yields is used.
      const slug = attributes.name === undefined ? undefined : draftSlug(attributes.name);
      const renamed = slug === undefined || (await isPublished(tx, indicatorId)) ? {} : { slug };

      // The slug left behind is held too, or two renames swapping slugs deadlock.
      if ('slug' in renamed)
        await lockSlugs(tx, [await draftSlugOf(tx, indicatorId), renamed.slug]);

      const isDraft = and(
        eq(indicatorVersion.indicatorId, indicatorId),
        eq(indicatorVersion.status, 'draft'),
      );
      // The update's own lock, taken first so the before values are the ones this save replaces.
      const [current] = await tx
        .select()
        .from(indicatorVersion)
        .where(isDraft)
        .for('no key update');

      if (current === undefined) return { ok: false, reason: 'no_draft' };
      if (current.isLocked) return { ok: false, reason: 'locked' };

      if (precondition !== undefined) {
        const version = precondition.versionOf({
          ...current,
          ...(await draftListsOf(tx, current.id)),
        });

        if (version !== precondition.version) return { ok: false, reason: 'changed', version };
      }

      const [draft] = await tx
        .update(indicatorVersion)
        .set({ ...attributes, ...renamed, updatedAt: sql`now()`, updatedBy: actor.userId })
        .where(eq(indicatorVersion.id, current.id))
        .returning();

      if (draft === undefined) {
        throw new Error(`updateIndicatorDraft locked draft ${current.id} but updated no row`);
      }

      const replaced = await replaceLists(tx, draft.id, lists);

      const changes = {
        ...changesBetween(current, draft),
        ...listChanges(replaced.before, replaced.after, UNORDERED_LISTS),
      };
      if (Object.keys(changes).length > 0) {
        await recordAudit(tx, actor, [
          { action: 'indicator.draft_updated', entityId: indicatorId, changes },
        ]);
      }

      return { ok: true };
    });
  } catch (error) {
    if (hasSqlState(error, EXCLUSION_VIOLATION)) return { ok: false, reason: 'slug_taken' };
    throw error;
  }
}

/**
 * Holds slugs until the transaction ends. Two writers of one slug otherwise each wait on the
 * other's exclusion check and deadlock; serialised, the later one fails the constraint instead.
 * Taken in one order, so two writers wanting the same pair cannot deadlock on the locks.
 */
async function lockSlugs(tx: Transaction, slugs: readonly (string | undefined)[]): Promise<void> {
  const held = [...new Set(slugs)].filter((slug) => slug !== undefined).sort();

  for (const slug of held) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SLUG_LOCK_NAMESPACE}, hashtext(${slug}))`);
  }
}

async function draftSlugOf(tx: Transaction, indicatorId: string): Promise<string | undefined> {
  const [draft] = await tx
    .select({ slug: indicatorVersion.slug })
    .from(indicatorVersion)
    .where(
      and(eq(indicatorVersion.indicatorId, indicatorId), eq(indicatorVersion.status, 'draft')),
    );

  return draft?.slug;
}

export async function isPublished(tx: Transaction, indicatorId: string): Promise<boolean> {
  const [published] = await tx
    .select({ id: currentPublishedVersion.id })
    .from(currentPublishedVersion)
    .where(eq(currentPublishedVersion.indicatorId, indicatorId));

  return published !== undefined;
}
