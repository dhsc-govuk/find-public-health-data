import { type Database, schema } from '@fphd/db';
import { type Actor, changesBetween, listChanges, recordAudit } from '@fphd/db/audit-log';
import { type IndicatorDraftVersion, isPublished, lockSlugs } from '@fphd/internal-workflow';
import { slugify, slugProblem } from '@fphd/utils/slug';
import { and, eq, getTableColumns, ne, sql } from 'drizzle-orm';

import {
  type CiMethodKind,
  type DraftReviewer,
  type DraftStatus,
  type DraftSubmissionStatus,
  type IndicatorStatus,
  type IndicatorTaskKey,
  justificationsSection,
  otherCommentsSection,
  type ReviewResponseKind,
  type UpdateDecision,
  varianceAndQualitySection,
} from './contract.ts';
import type { EditPrecondition } from './edit-version.ts';
import {
  draftJoin,
  draftResponseKind,
  draftReviewers,
  draftStatus,
  draftSubmissionStatus,
  draftUpdateDecision,
  draftVersion,
  EXCLUSION_VIOLATION,
  hasSqlState,
  indicatorStatus,
  publishedJoin,
  publishedVersion,
  publishedVersionJoin,
  type Transaction,
  violatesConstraint,
} from './indicator-repository-sql.ts';
import {
  ageRangesOf,
  classificationsOf,
  type IndicatorDraftAgeRange,
  type IndicatorDraftClassification,
  type IndicatorDraftLists,
  type IndicatorDraftSources,
  type IndicatorDraftTaxonomy,
  replaceLists,
  sourcesOf,
  taxonomyOf,
  UNORDERED_LISTS,
} from './indicator-version-lists-repository.ts';
import { clearFlag } from './review-flag-repository.ts';

const { ciMethod, currentPublishedVersion, indicator, indicatorVersion, isUnpublished } = schema;

export type { IndicatorDraftVersion };

/** A draft as the sections read it: its columns, and the lists held in tables of their own. */
export type IndicatorDraft = IndicatorDraftVersion &
  IndicatorDraftSources &
  IndicatorDraftTaxonomy & {
    ageRanges: IndicatorDraftAgeRange[];
    /** Ordered by title, as the tagging page lists them. */
    topicIds: string[];
    /** Ordered by name, as the tagging page lists them. */
    classifications: IndicatorDraftClassification[];
  };

export interface IndicatorDraftStateRow {
  id: string;
  shortId: number;
  teamId: string;
  /** The draft a publisher is working on, absent while the indicator has none. */
  draft: IndicatorDraft | null;
  /** What the draft's CI method asks for, which the task list needs to judge its answers. */
  draftCiMethodKind: CiMethodKind | null;
  indicatorStatus: IndicatorStatus;
  draftStatus: DraftStatus | null;
  draftSubmissionStatus: DraftSubmissionStatus | null;
  /** What the latest response to the draft's latest submission said, which names its label. */
  draftResponseKind: ReviewResponseKind | null;
  /** The core team's decision on the draft's latest submission, which only an update has. */
  draftUpdateDecision: UpdateDecision | null;
  /** The reviewers of the draft's latest submission, who may take steps on it too. */
  draftReviewers: DraftReviewer[];
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
      draftResponseKind,
      draftUpdateDecision,
      draftReviewers,
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

/**
 * The published version's columns and lists, read as a draft's are, which an update's answers are
 * compared with. Undefined while nothing is published.
 */
export async function getPublishedAnswers(
  db: Database | Transaction,
  id: string,
): Promise<IndicatorDraft | undefined> {
  const [published] = await db
    .select(getTableColumns(indicatorVersion))
    .from(currentPublishedVersion)
    .innerJoin(indicatorVersion, eq(indicatorVersion.id, currentPublishedVersion.id))
    .where(eq(currentPublishedVersion.indicatorId, id));

  if (published === undefined) return undefined;

  return { ...published, ...(await draftListsOf(db, published.id)) };
}

const NOTES_FOR_REVIEWERS_FIELDS = [
  ...varianceAndQualitySection.fields.options,
  ...justificationsSection.fields.options,
  ...otherCommentsSection.fields.options,
] as const;

type NotesForReviewersField = (typeof NOTES_FOR_REVIEWERS_FIELDS)[number];

/** The columns the notes for reviewers come from, with the version's id to show it exists. */
export type NotesForReviewersVersion = Pick<IndicatorDraftVersion, 'id' | NotesForReviewersField>;

/** Who may read an indicator's notes for reviewers, and the version they come from. */
export interface IndicatorNotesForReviewersRow {
  /** The draft, or the published version while there is no draft. */
  version: NotesForReviewersVersion;
}

function notesForReviewersColumns<Version extends Record<NotesForReviewersField, unknown>>(
  version: Version,
) {
  return Object.fromEntries(
    NOTES_FOR_REVIEWERS_FIELDS.map((field) => [field, version[field]]),
  ) as Pick<Version, NotesForReviewersField>;
}

// A left-joined version none of whose columns came back is one that does not exist.
function existing(version: { id: string | null } | null): version is NotesForReviewersVersion {
  return version !== null && version.id !== null;
}

/**
 * The notes for reviewers, in one statement: from the draft, or the published version while
 * there is no draft. Undefined when there is no such indicator.
 */
export async function getIndicatorNotesForReviewers(
  db: Database,
  id: string,
): Promise<IndicatorNotesForReviewersRow | undefined> {
  const [row] = await db
    .select({
      draft: { id: draftVersion.id, ...notesForReviewersColumns(draftVersion) },
      published: { id: publishedVersion.id, ...notesForReviewersColumns(publishedVersion) },
    })
    .from(indicator)
    .leftJoin(draftVersion, draftJoin)
    .leftJoin(currentPublishedVersion, publishedJoin)
    .leftJoin(publishedVersion, publishedVersionJoin)
    .where(eq(indicator.id, id));

  if (row === undefined) return undefined;

  const version = [row.draft, row.published].find(existing);

  // Every indicator has a draft, a published version or both.
  if (version === undefined) throw new Error('the indicator has no version to read');

  return { version };
}

/** The lists a draft holds in tables of its own, as the sections read them. */
export async function draftListsOf(
  db: Database | Transaction,
  draftId: string,
): Promise<Omit<IndicatorDraft, keyof IndicatorDraftVersion>> {
  const [ageRanges, taxonomy, classifications, sources] = await Promise.all([
    ageRangesOf(db, draftId),
    taxonomyOf(db, draftId),
    classificationsOf(db, draftId),
    sourcesOf(db, draftId),
  ]);

  return { ...sources, ...taxonomy, ageRanges, classifications };
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

/**
 * The draft created, or the one an earlier copy of the same request created, marked `repeated`.
 * `id_taken` means another indicator has the id, and the request is not a repeat of the one that
 * created it.
 */
export type CreateIndicatorDraftResult =
  | ({ ok: true; repeated?: true } & CreatedIndicatorDraft)
  | { ok: false; reason: 'slug_taken' | 'id_taken' };

export type UpdateIndicatorDraftResult =
  | { ok: true }
  | { ok: false; reason: 'no_draft' | 'locked' | 'slug_taken' }
  | { ok: false; reason: 'changed'; version: string };

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

/**
 * What an earlier copy of this create request made, if one did: the draft of the indicator with
 * this id, in this team, created by this user and still under this name. When another indicator
 * has the id it answers `id_taken`, and when the id is free it answers undefined.
 */
async function earlierCreation(
  tx: Transaction,
  id: string,
  name: string,
  actor: Actor,
  teamId: string,
): Promise<CreateIndicatorDraftResult | undefined> {
  const [existing] = await tx
    .select({
      teamId: indicator.teamId,
      shortId: indicator.shortId,
      versionId: indicatorVersion.id,
      name: indicatorVersion.name,
      createdBy: indicatorVersion.createdBy,
    })
    .from(indicator)
    .leftJoin(
      indicatorVersion,
      and(eq(indicatorVersion.indicatorId, indicator.id), isUnpublished(indicatorVersion.status)),
    )
    .where(eq(indicator.id, id));

  if (existing === undefined) return undefined;

  const { versionId } = existing;
  const repeated =
    existing.teamId === teamId && existing.createdBy === actor.userId && existing.name === name;

  return versionId !== null && repeated
    ? { ok: true, repeated: true, indicatorId: id, shortId: existing.shortId, versionId }
    : { ok: false, reason: 'id_taken' };
}

/**
 * A new indicator is an identity in a team and a draft version. The indicator takes the id the
 * name page minted, and the database mints the version's. A repeat of a create that went
 * through, such as a double click, answers with the indicator it made and writes nothing. Two
 * copies of one request wait on the same slug lock, so the second finds the first's indicator.
 */
export async function createIndicatorDraft(
  db: Database,
  id: string,
  attributes: NewIndicatorDraftAttributes,
  actor: Actor,
  teamId: string,
): Promise<CreateIndicatorDraftResult> {
  const slug = draftSlug(attributes.name);

  try {
    return await db.transaction(async (tx) => {
      await lockSlugs(tx, [slug]);

      const earlier = await earlierCreation(tx, id, attributes.name, actor, teamId);

      if (earlier !== undefined) return earlier;

      const [identity] = await tx
        .insert(indicator)
        .values({ id, teamId })
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
    // Requests under two names took different slug locks, so both may try to insert the id.
    if (violatesConstraint(error, 'indicator_pkey')) return { ok: false, reason: 'id_taken' };
    throw error;
  }
}

/**
 * Rewrites a draft's columns and, when given, its lists. Lists are replaced rather than
 * merged: the submission states what is true now. A renamed draft is
 * re-slugged only while nothing is published. A draft of a live indicator keeps the published
 * slug, and the page moves to the slug of the new name only when the renamed update is
 * published. Such a rename answers `slug_taken` when another indicator's version already
 * carries the slug of the new name. That is a check, not a reservation: the slug can still be
 * taken before the update is published. Returns `locked` if the draft is locked for review. Returns `changed`, with the current version, if the draft has changed
 * since the form was shown. Saving `task` clears the flag a review response left on it, whether
 * or not its answers changed.
 */
export async function updateIndicatorDraft(
  db: Database,
  indicatorId: string,
  task: IndicatorTaskKey,
  attributes: IndicatorDraftAttributes,
  lists: IndicatorDraftLists,
  actor: Actor,
  precondition?: EditPrecondition<IndicatorDraft>,
): Promise<UpdateIndicatorDraftResult> {
  try {
    return await db.transaction(async (tx) => {
      // The name is checked whether or not the slug it yields is used.
      const slug = attributes.name === undefined ? undefined : draftSlug(attributes.name);
      const live = slug !== undefined && (await isPublished(tx, indicatorId));
      const renamed = slug === undefined || live ? {} : { slug };

      // The slug left behind is held too, or two renames swapping slugs deadlock.
      if ('slug' in renamed)
        await lockSlugs(tx, [await draftSlugOf(tx, indicatorId), renamed.slug]);

      const isDraft = and(
        eq(indicatorVersion.indicatorId, indicatorId),
        isUnpublished(indicatorVersion.status),
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

      // A live indicator's draft keeps the published slug, so the exclusion constraint never sees
      // the slug of its new name. Another indicator's version carrying it is checked here instead.
      if (live && (await isSlugOfAnotherIndicator(tx, slug, indicatorId))) {
        return { ok: false, reason: 'slug_taken' };
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
        ...(await clearFlag(tx, draft.id, task, actor)),
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
 * Whether a version of an indicator other than `indicatorId`, in any status, carries `slug`.
 * Every version's slug counts, as the slug exclusion constraint counts them.
 */
async function isSlugOfAnotherIndicator(
  tx: Transaction,
  slug: string,
  indicatorId: string,
): Promise<boolean> {
  const [holder] = await tx
    .select({ id: indicatorVersion.id })
    .from(indicatorVersion)
    .where(and(eq(indicatorVersion.slug, slug), ne(indicatorVersion.indicatorId, indicatorId)))
    .limit(1);

  return holder !== undefined;
}

async function draftSlugOf(tx: Transaction, indicatorId: string): Promise<string | undefined> {
  const [draft] = await tx
    .select({ slug: indicatorVersion.slug })
    .from(indicatorVersion)
    .where(
      and(eq(indicatorVersion.indicatorId, indicatorId), isUnpublished(indicatorVersion.status)),
    );

  return draft?.slug;
}
