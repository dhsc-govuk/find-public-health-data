import { type Database, schema } from '@fphd/db';
import {
  CLASSIFICATION_DIMENSIONS,
  type ClassificationDimension,
} from '@fphd/utils/classification-dimension';
import type { IndicatorCalculationPart } from '@fphd/utils/source-part';
import { and, asc, eq, inArray } from 'drizzle-orm';

import type { Transaction } from './indicator-repository-sql.ts';

const {
  classification,
  indicatorVersionClassification,
  indicatorVersionTopic,
  subtopic,
  indicatorVersionSubtopic,
  indicatorVersionAgeRange,
  indicatorVersionDataValue,
  indicatorVersionGoal,
  indicatorVersionSource,
  topic,
} = schema;

export type IndicatorDraftAgeRange = Omit<
  typeof indicatorVersionAgeRange.$inferSelect,
  'indicatorVersionId' | 'position'
>;

export type IndicatorDraftGoal = Omit<
  typeof indicatorVersionGoal.$inferSelect,
  'indicatorVersionId' | 'position'
>;

/** A provider of a figure's data, and its source, null for none specific. */
export type IndicatorDraftSource = Pick<
  typeof indicatorVersionSource.$inferSelect,
  'providerId' | 'sourceId'
>;

/** A data value of a version without a numerator and denominator, with its sources in order. */
export type IndicatorDraftDataValue = Pick<
  typeof indicatorVersionDataValue.$inferSelect,
  'definition' | 'disclosureControl' | 'disclosureControlDetail'
> & { sources: IndicatorDraftSource[] };

/**
 * The providers and sources of each half of the calculation, and the data values, each in the
 * order they were added.
 */
export interface IndicatorDraftSources {
  numeratorSources: IndicatorDraftSource[];
  denominatorSources: IndicatorDraftSource[];
  dataValues: IndicatorDraftDataValue[];
}

export interface IndicatorDraftClassification {
  id: string;
  dimension: ClassificationDimension;
}

/** The draft's answers held in tables of their own; each is replaced whole when given. */
export interface IndicatorDraftLists extends Partial<IndicatorDraftSources> {
  topicIds?: string[];
  subtopicIds?: string[];
  /** Each dimension given is replaced; the others are left as they are. */
  classificationIds?: Partial<Record<ClassificationDimension, string[]>>;
  /** In the order they are shown. */
  ageRanges?: IndicatorDraftAgeRange[];
  /** In the order they are shown. */
  goals?: IndicatorDraftGoal[];
}

export async function sourcesOf(
  db: Database | Transaction,
  versionId: string,
): Promise<IndicatorDraftSources> {
  const [rows, dataValues] = await Promise.all([
    db
      .select({
        part: indicatorVersionSource.part,
        dataValuePosition: indicatorVersionSource.dataValuePosition,
        providerId: indicatorVersionSource.providerId,
        sourceId: indicatorVersionSource.sourceId,
      })
      .from(indicatorVersionSource)
      .where(eq(indicatorVersionSource.indicatorVersionId, versionId))
      .orderBy(asc(indicatorVersionSource.position)),
    db
      .select({
        position: indicatorVersionDataValue.position,
        definition: indicatorVersionDataValue.definition,
        disclosureControl: indicatorVersionDataValue.disclosureControl,
        disclosureControlDetail: indicatorVersionDataValue.disclosureControlDetail,
      })
      .from(indicatorVersionDataValue)
      .where(eq(indicatorVersionDataValue.indicatorVersionId, versionId))
      .orderBy(asc(indicatorVersionDataValue.position)),
  ]);
  const sourcesWhere = (matches: (row: (typeof rows)[number]) => boolean) =>
    rows.filter(matches).map(({ providerId, sourceId }) => ({ providerId, sourceId }));
  const ofPart = (part: IndicatorCalculationPart) => sourcesWhere((row) => row.part === part);

  return {
    numeratorSources: ofPart('numerator'),
    denominatorSources: ofPart('denominator'),
    dataValues: dataValues.map(({ position, ...dataValue }) => ({
      ...dataValue,
      sources: sourcesWhere(
        (row) => row.part === 'data-value' && row.dataValuePosition === position,
      ),
    })),
  };
}

export interface IndicatorDraftTaxonomy {
  topicIds: string[];
  subtopicIds: string[];
}

export async function taxonomyOf(
  db: Database | Transaction,
  versionId: string,
): Promise<IndicatorDraftTaxonomy> {
  const rows = await db
    .select({
      topicId: indicatorVersionTopic.topicId,
      subtopicId: indicatorVersionSubtopic.subtopicId,
    })
    .from(indicatorVersionTopic)
    .innerJoin(topic, eq(topic.id, indicatorVersionTopic.topicId))
    .leftJoin(
      indicatorVersionSubtopic,
      and(
        eq(indicatorVersionSubtopic.indicatorVersionId, indicatorVersionTopic.indicatorVersionId),
        eq(indicatorVersionSubtopic.topicId, indicatorVersionTopic.topicId),
      ),
    )
    .where(eq(indicatorVersionTopic.indicatorVersionId, versionId))
    .orderBy(asc(topic.title), asc(indicatorVersionSubtopic.subtopicId));
  return {
    topicIds: [...new Set(rows.map(({ topicId }) => topicId))],
    subtopicIds: rows.flatMap(({ subtopicId }) => subtopicId ?? []),
  };
}

export async function topicIdsOf(db: Database | Transaction, versionId: string): Promise<string[]> {
  const rows = await db
    .select({ id: indicatorVersionTopic.topicId })
    .from(indicatorVersionTopic)
    .innerJoin(topic, eq(topic.id, indicatorVersionTopic.topicId))
    .where(eq(indicatorVersionTopic.indicatorVersionId, versionId))
    .orderBy(asc(topic.title));

  return rows.map(({ id }) => id);
}

export async function classificationsOf(
  db: Database | Transaction,
  versionId: string,
): Promise<IndicatorDraftClassification[]> {
  return db
    .select({ id: classification.id, dimension: classification.dimension })
    .from(indicatorVersionClassification)
    .innerJoin(
      classification,
      eq(classification.id, indicatorVersionClassification.classificationId),
    )
    .where(eq(indicatorVersionClassification.indicatorVersionId, versionId))
    .orderBy(asc(classification.name));
}

export async function ageRangesOf(
  db: Database | Transaction,
  versionId: string,
): Promise<IndicatorDraftAgeRange[]> {
  return db
    .select({
      lowerLimit: indicatorVersionAgeRange.lowerLimit,
      lowerLimitUnit: indicatorVersionAgeRange.lowerLimitUnit,
      upperLimit: indicatorVersionAgeRange.upperLimit,
      upperLimitUnit: indicatorVersionAgeRange.upperLimitUnit,
    })
    .from(indicatorVersionAgeRange)
    .where(eq(indicatorVersionAgeRange.indicatorVersionId, versionId))
    .orderBy(asc(indicatorVersionAgeRange.position));
}

export async function goalsOf(
  db: Database | Transaction,
  versionId: string,
): Promise<IndicatorDraftGoal[]> {
  return db
    .select({
      lowerComparison: indicatorVersionGoal.lowerComparison,
      lowerValue: indicatorVersionGoal.lowerValue,
      upperComparison: indicatorVersionGoal.upperComparison,
      upperValue: indicatorVersionGoal.upperValue,
      polarity: indicatorVersionGoal.polarity,
      policyDetail: indicatorVersionGoal.policyDetail,
    })
    .from(indicatorVersionGoal)
    .where(eq(indicatorVersionGoal.indicatorVersionId, versionId))
    .orderBy(asc(indicatorVersionGoal.position));
}

/**
 * The audit log's field for one dimension's classifications, such as `classificationIds.lifeStage`:
 * a save replaces each dimension it names and leaves the others, so each is a list of its own.
 */
export function classificationAuditField(
  dimension: ClassificationDimension,
): `classificationIds.${string}` {
  return `classificationIds.${dimension.replace(/_([a-z])/g, (_, next: string) => next.toUpperCase())}`;
}

/** Every list a replacement may rewrite, by the field the audit log records it as. */
export const LIST_AUDIT_FIELDS = [
  'topicIds',
  'subtopicPlacements',
  ...CLASSIFICATION_DIMENSIONS.map(classificationAuditField),
  'ageRanges',
  'goals',
  'numeratorSources',
  'denominatorSources',
  'dataValues',
] as const;

export type ListAuditField = (typeof LIST_AUDIT_FIELDS)[number];

/** The lists whose order means nothing, compared as sets in the audit log. */
export const UNORDERED_LISTS: readonly ListAuditField[] = [
  'topicIds',
  'subtopicPlacements',
  ...CLASSIFICATION_DIMENSIONS.map(classificationAuditField),
];

/** The lists a replacement rewrote, as the audit log records them: what each held, and holds. */
type ClassificationAuditField = ReturnType<typeof classificationAuditField>;

/** Each list a replacement rewrote, by its audit field. */
type ListsByAuditField = Partial<
  Record<Exclude<ListAuditField, ClassificationAuditField>, unknown[]>
> &
  Record<ClassificationAuditField, unknown[]>;

export interface ReplacedLists {
  before: ListsByAuditField;
  after: ListsByAuditField;
}

const auditedAgeRange = (range: IndicatorDraftAgeRange) => ({
  lowerLimit: range.lowerLimit ?? null,
  lowerLimitUnit: range.lowerLimitUnit ?? null,
  upperLimit: range.upperLimit ?? null,
  upperLimitUnit: range.upperLimitUnit ?? null,
});

const auditedGoal = (goal: IndicatorDraftGoal) => ({
  lowerComparison: goal.lowerComparison,
  lowerValue: goal.lowerValue,
  upperComparison: goal.upperComparison,
  upperValue: goal.upperValue,
  polarity: goal.polarity,
  policyDetail: goal.policyDetail,
});

const auditedSource = ({ providerId, sourceId }: IndicatorDraftSource) => ({
  providerId,
  sourceId: sourceId ?? null,
});

const auditedDataValue = (dataValue: IndicatorDraftDataValue) => ({
  definition: dataValue.definition ?? null,
  disclosureControl: dataValue.disclosureControl ?? null,
  disclosureControlDetail: dataValue.disclosureControlDetail ?? null,
  sources: dataValue.sources.map(auditedSource),
});

/** Rows a delete returned, in the order their positions give. */
function inPosition<Row extends { position: number }>(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => a.position - b.position);
}

/**
 * Replaces the lists given and answers what each held before, from the rows its delete removed,
 * so a row another writer removed first is not counted as this replacement's.
 */
export async function replaceLists(
  tx: Transaction,
  versionId: string,
  {
    ageRanges,
    goals,
    classificationIds,
    topicIds,
    subtopicIds,
    numeratorSources,
    denominatorSources,
    dataValues,
  }: IndicatorDraftLists,
): Promise<ReplacedLists> {
  const before: ReplacedLists['before'] = {};
  const after: ReplacedLists['after'] = {};

  if (topicIds !== undefined) {
    const placements = await tx
      .select()
      .from(indicatorVersionSubtopic)
      .where(eq(indicatorVersionSubtopic.indicatorVersionId, versionId));
    const removed = await tx
      .delete(indicatorVersionTopic)
      .where(eq(indicatorVersionTopic.indicatorVersionId, versionId))
      .returning({ topicId: indicatorVersionTopic.topicId });
    if (topicIds.length > 0) {
      await tx
        .insert(indicatorVersionTopic)
        .values(topicIds.map((topicId) => ({ topicId, indicatorVersionId: versionId })));
    }
    const retained =
      subtopicIds === undefined
        ? placements.filter(({ topicId }) => topicIds.includes(topicId))
        : (subtopicIds.length
            ? await tx
                .select({ subtopicId: subtopic.id, topicId: subtopic.topicId })
                .from(subtopic)
                .where(inArray(subtopic.id, subtopicIds))
            : []
          ).map((row) => ({ ...row, indicatorVersionId: versionId }));
    if (retained.length) await tx.insert(indicatorVersionSubtopic).values(retained);
    if (placements.length || retained.length) {
      const placement = ({
        topicId,
        subtopicId,
      }: typeof indicatorVersionSubtopic.$inferSelect) => ({
        topicId,
        subtopicId,
      });
      before.subtopicPlacements = placements.map(placement);
      after.subtopicPlacements = retained.map(placement);
    }
    before.topicIds = removed.map(({ topicId }) => topicId);
    after.topicIds = topicIds;
  }

  for (const dimension of CLASSIFICATION_DIMENSIONS) {
    const ids = classificationIds?.[dimension];
    if (ids === undefined) continue;

    const removed = await tx
      .delete(indicatorVersionClassification)
      .where(
        and(
          eq(indicatorVersionClassification.indicatorVersionId, versionId),
          inArray(
            indicatorVersionClassification.classificationId,
            tx
              .select({ id: classification.id })
              .from(classification)
              .where(eq(classification.dimension, dimension)),
          ),
        ),
      )
      .returning({ id: indicatorVersionClassification.classificationId });
    if (ids.length > 0) {
      await tx
        .insert(indicatorVersionClassification)
        .values(
          ids.map((classificationId) => ({ classificationId, indicatorVersionId: versionId })),
        );
    }
    before[classificationAuditField(dimension)] = removed.map(({ id }) => id);
    after[classificationAuditField(dimension)] = ids;
  }

  if (ageRanges !== undefined) {
    const removed = await tx
      .delete(indicatorVersionAgeRange)
      .where(eq(indicatorVersionAgeRange.indicatorVersionId, versionId))
      .returning();
    if (ageRanges.length > 0) {
      await tx.insert(indicatorVersionAgeRange).values(
        ageRanges.map((range, position) => ({
          ...range,
          indicatorVersionId: versionId,
          position,
        })),
      );
    }
    before.ageRanges = inPosition(removed).map(auditedAgeRange);
    after.ageRanges = ageRanges.map(auditedAgeRange);
  }

  if (goals !== undefined) {
    const removed = await tx
      .delete(indicatorVersionGoal)
      .where(eq(indicatorVersionGoal.indicatorVersionId, versionId))
      .returning();
    if (goals.length > 0) {
      await tx.insert(indicatorVersionGoal).values(
        goals.map((goal, position) => ({
          ...goal,
          indicatorVersionId: versionId,
          position,
        })),
      );
    }
    before.goals = inPosition(removed).map(auditedGoal);
    after.goals = goals.map(auditedGoal);
  }

  for (const [field, part, sources] of [
    ['numeratorSources', 'numerator', numeratorSources],
    ['denominatorSources', 'denominator', denominatorSources],
  ] as const) {
    if (sources === undefined) continue;
    before[field] = (await replaceSources(tx, versionId, part, sources)).map(auditedSource);
    after[field] = sources.map(auditedSource);
  }

  if (dataValues !== undefined) {
    before.dataValues = (await replaceDataValues(tx, versionId, dataValues)).map(auditedDataValue);
    after.dataValues = dataValues.map(auditedDataValue);
  }

  return { before, after };
}

/** Copies a version's subtopic placements onto another that already holds the same topics. */
export async function copyTaxonomyPlacements(
  tx: Transaction,
  fromVersionId: string,
  toVersionId: string,
): Promise<unknown[]> {
  const topics = await tx
    .select({ topicId: indicatorVersionTopic.topicId })
    .from(indicatorVersionTopic)
    .where(eq(indicatorVersionTopic.indicatorVersionId, fromVersionId));
  const subtopics = await tx
    .select()
    .from(indicatorVersionSubtopic)
    .where(eq(indicatorVersionSubtopic.indicatorVersionId, fromVersionId));
  if (subtopics.length)
    await tx
      .insert(indicatorVersionSubtopic)
      .values(subtopics.map((row) => ({ ...row, indicatorVersionId: toVersionId })));
  return topics.map(({ topicId }) => ({
    topicId,
    subtopics: subtopics
      .filter((row) => row.topicId === topicId)
      .map(({ subtopicId }) => ({ subtopicId })),
  }));
}

/** Answers the sources it removed, in their order. */
async function replaceSources(
  tx: Transaction,
  versionId: string,
  part: IndicatorCalculationPart,
  sources: IndicatorDraftSource[],
): Promise<IndicatorDraftSource[]> {
  const removed = await tx
    .delete(indicatorVersionSource)
    .where(
      and(
        eq(indicatorVersionSource.indicatorVersionId, versionId),
        eq(indicatorVersionSource.part, part),
      ),
    )
    .returning();

  if (sources.length > 0) {
    await tx.insert(indicatorVersionSource).values(
      sources.map(({ providerId, sourceId }, position) => ({
        indicatorVersionId: versionId,
        part,
        position,
        providerId,
        sourceId,
      })),
    );
  }

  return inPosition(removed);
}

/**
 * Answers the data values it removed, with their sources, in their order. A data value's
 * sources take positions that run on through the version's data values, as their key needs.
 */
async function replaceDataValues(
  tx: Transaction,
  versionId: string,
  dataValues: IndicatorDraftDataValue[],
): Promise<IndicatorDraftDataValue[]> {
  const removedSources = await tx
    .delete(indicatorVersionSource)
    .where(
      and(
        eq(indicatorVersionSource.indicatorVersionId, versionId),
        eq(indicatorVersionSource.part, 'data-value'),
      ),
    )
    .returning();
  const removed = await tx
    .delete(indicatorVersionDataValue)
    .where(eq(indicatorVersionDataValue.indicatorVersionId, versionId))
    .returning();

  if (dataValues.length > 0) {
    await tx.insert(indicatorVersionDataValue).values(
      dataValues.map(({ definition, disclosureControl, disclosureControlDetail }, position) => ({
        indicatorVersionId: versionId,
        position,
        definition,
        disclosureControl,
        disclosureControlDetail,
      })),
    );
    const sources = dataValues.flatMap(({ sources: ofDataValue }, dataValuePosition) =>
      ofDataValue.map((source) => ({ ...source, dataValuePosition })),
    );
    if (sources.length > 0) {
      await tx.insert(indicatorVersionSource).values(
        sources.map(({ providerId, sourceId, dataValuePosition }, position) => ({
          indicatorVersionId: versionId,
          part: 'data-value' as const,
          position,
          providerId,
          sourceId,
          dataValuePosition,
        })),
      );
    }
  }

  const sourcesInPosition = inPosition(removedSources);

  return inPosition(removed).map(
    ({ position, definition, disclosureControl, disclosureControlDetail }) => ({
      definition,
      disclosureControl,
      disclosureControlDetail,
      sources: sourcesInPosition
        .filter(({ dataValuePosition }) => dataValuePosition === position)
        .map(({ providerId, sourceId }) => ({ providerId, sourceId })),
    }),
  );
}
