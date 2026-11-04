import { type Database, schema } from '@fphd/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { IndicatorTopicFile } from './indicator-topic-file.ts';

const {
  classification,
  currentPublishedVersion,
  indicator,
  indicatorVersion,
  indicatorVersionClassification,
  indicatorVersionSubtopic,
  indicatorVersionTopic,
  isUnpublished,
  subtopic,
  topic,
} = schema;

export interface IndicatorTopicImportSummary {
  classificationLinks: number;
  subtopicLinks: number;
  links: number;
  timestamps: number;
  unknownTopics: string[];
  unknownClassifications: string[];
  unknownSubtopics: string[];
  unknownIndicators: number[];
}

const draftVersion = alias(indicatorVersion, 'draft_version');

/**
 * Replaces the topic memberships and classifications of the indicators the file names, and
 * records when the source system last published their data. A membership belongs to a version: the
 * published one if the indicator has one, otherwise its draft. Memberships are replaced,
 * not merged, because the file states what is true now.
 *
 * Rows naming a topic, classification or indicator this database does not hold are reported rather than
 * failed on — a seed file and a database can legitimately drift while both are in flux.
 *
 * Runs several statements without opening a transaction, so the caller owns atomicity —
 * the dummy seed applies this inside the same transaction as the tables it loads.
 */
export async function applyIndicatorTopics(
  db: Database,
  file: IndicatorTopicFile,
): Promise<IndicatorTopicImportSummary> {
  const topicIds = [...new Set(file.indicatorTopics.map(({ topicId }) => topicId))];
  const subtopicIds = [...new Set(file.indicatorSubtopics.map(({ subtopicId }) => subtopicId))];
  const shortIds = [
    ...new Set([
      ...file.indicators,
      ...file.areaContextIndicators,
      ...file.indicatorTopics.map(({ fingertipsId }) => fingertipsId),
      ...file.indicatorClassifications.map(({ fingertipsId }) => fingertipsId),
      ...Object.keys(file.indicatorDataUpdatedAt).map(Number),
    ]),
  ];

  const [topics, indicators, subtopics] = await Promise.all([
    topicIds.length > 0
      ? db.select({ id: topic.id }).from(topic).where(inArray(topic.id, topicIds))
      : Promise.resolve([]),
    shortIds.length > 0
      ? db
          .select({
            id: indicator.id,
            shortId: indicator.shortId,
            versionId: sql<
              string | null
            >`coalesce(${currentPublishedVersion.id}, ${draftVersion.id})`,
          })
          .from(indicator)
          .leftJoin(currentPublishedVersion, eq(currentPublishedVersion.indicatorId, indicator.id))
          .leftJoin(
            draftVersion,
            and(eq(draftVersion.indicatorId, indicator.id), isUnpublished(draftVersion.status)),
          )
          .where(inArray(indicator.shortId, shortIds))
      : Promise.resolve([]),
    subtopicIds.length > 0
      ? db
          .select({ id: subtopic.id, topicId: subtopic.topicId })
          .from(subtopic)
          .where(inArray(subtopic.id, subtopicIds))
      : Promise.resolve([]),
  ]);

  const knownTopicIds = new Set(topics.map((row) => row.id));
  const indicatorIdByShortId = new Map(indicators.map((row) => [row.shortId, row.id]));
  const versionIdByShortId = new Map(
    indicators.flatMap((row) => (row.versionId === null ? [] : [[row.shortId, row.versionId]])),
  );

  const links = file.indicatorTopics.flatMap(({ topicId, fingertipsId, isPrimary }) => {
    const indicatorVersionId = versionIdByShortId.get(fingertipsId);
    return knownTopicIds.has(topicId) && indicatorVersionId
      ? [{ topicId, indicatorVersionId, isPrimary: isPrimary ?? false }]
      : [];
  });

  const explicitlyCovered = [
    ...new Set([...file.indicators, ...file.areaContextIndicators]),
  ].flatMap((id) => versionIdByShortId.get(id) ?? []);
  const versionIds = [
    ...new Set([
      ...explicitlyCovered,
      ...links.map(({ indicatorVersionId }) => indicatorVersionId),
    ]),
  ];
  if (versionIds.length > 0) {
    await db
      .delete(indicatorVersionTopic)
      .where(inArray(indicatorVersionTopic.indicatorVersionId, versionIds));
    if (links.length > 0) await db.insert(indicatorVersionTopic).values(links);
  }

  const parentBySubtopic = new Map(subtopics.map(({ id, topicId }) => [id, topicId]));
  const subtopicLinks = file.indicatorSubtopics.flatMap(
    ({ fingertipsId, topicId, subtopicId, isPrimary }) => {
      const indicatorVersionId = versionIdByShortId.get(fingertipsId);
      return indicatorVersionId &&
        knownTopicIds.has(topicId) &&
        parentBySubtopic.get(subtopicId) === topicId
        ? [{ indicatorVersionId, topicId, subtopicId, isPrimary: isPrimary ?? false }]
        : [];
    },
  );
  if (subtopicLinks.length) await db.insert(indicatorVersionSubtopic).values(subtopicLinks);
  if (versionIds.length)
    await db
      .update(indicatorVersion)
      .set({ isAreaContext: false })
      .where(inArray(indicatorVersion.id, versionIds));
  if (explicitlyCovered.length) {
    await db
      .update(indicatorVersion)
      .set({
        hasFramework: false,
        hasLifeStage: false,
      })
      .where(inArray(indicatorVersion.id, explicitlyCovered));
  }
  const contextVersions = file.areaContextIndicators.flatMap(
    (id) => versionIdByShortId.get(id) ?? [],
  );
  if (contextVersions.length)
    await db
      .update(indicatorVersion)
      .set({ isAreaContext: true })
      .where(inArray(indicatorVersion.id, contextVersions));

  let timestamps = 0;
  for (const [fingertipsId, updatedAt] of Object.entries(file.indicatorDataUpdatedAt)) {
    const indicatorId = indicatorIdByShortId.get(Number(fingertipsId));
    if (!indicatorId || !updatedAt) {
      continue;
    }
    await db
      .update(indicator)
      .set({ dataUpdatedAt: new Date(updatedAt.endsWith('Z') ? updatedAt : `${updatedAt}Z`) })
      .where(eq(indicator.id, indicatorId));
    timestamps += 1;
  }

  const classificationLinks = await applyIndicatorClassifications(
    db,
    file.indicatorClassifications,
    versionIdByShortId,
    explicitlyCovered,
  );

  return {
    classificationLinks: classificationLinks.links,
    subtopicLinks: subtopicLinks.length,
    links: links.length,
    timestamps,
    unknownTopics: topicIds.filter((id) => !knownTopicIds.has(id)),
    unknownClassifications: classificationLinks.unknownIds,
    unknownSubtopics: file.indicatorSubtopics
      .filter(({ subtopicId, topicId }) => parentBySubtopic.get(subtopicId) !== topicId)
      .map(({ subtopicId }) => subtopicId),
    unknownIndicators: shortIds.filter((id) => !indicatorIdByShortId.has(id)),
  };
}

/** Replaces imported tags and answers optional tagging questions from their explicit assignments. */
async function applyIndicatorClassifications(
  db: Database,
  rows: IndicatorTopicFile['indicatorClassifications'],
  versionIdByShortId: ReadonlyMap<number, string>,
  explicitlyCovered: string[],
): Promise<{ links: number; unknownIds: string[] }> {
  const ids = [...new Set(rows.map(({ classificationId }) => classificationId))];
  const known =
    ids.length > 0
      ? await db
          .select({ id: classification.id, dimension: classification.dimension })
          .from(classification)
          .where(inArray(classification.id, ids))
      : [];
  const dimensionById = new Map(known.map((row) => [row.id, row.dimension]));

  const links = rows.flatMap(({ fingertipsId, classificationId }) => {
    const indicatorVersionId = versionIdByShortId.get(fingertipsId);
    const dimension = dimensionById.get(classificationId);
    return indicatorVersionId && dimension
      ? [{ indicatorVersionId, classificationId, dimension }]
      : [];
  });
  const versionIds = [
    ...new Set([
      ...explicitlyCovered,
      ...links.map(({ indicatorVersionId }) => indicatorVersionId),
    ]),
  ];

  if (versionIds.length > 0) {
    await db
      .delete(indicatorVersionClassification)
      .where(inArray(indicatorVersionClassification.indicatorVersionId, versionIds));
    if (links.length)
      await db.insert(indicatorVersionClassification).values(
        links.map(({ indicatorVersionId, classificationId }) => ({
          indicatorVersionId,
          classificationId,
        })),
      );
  }

  const answeredYes = (dimension: string) => [
    ...new Set(
      links.filter((link) => link.dimension === dimension).map((link) => link.indicatorVersionId),
    ),
  ];
  const withFramework = answeredYes('framework');
  const withLifeStage = answeredYes('life_stage');
  if (withLifeStage.length)
    await db
      .update(indicatorVersion)
      .set({ hasLifeStage: true })
      .where(inArray(indicatorVersion.id, withLifeStage));

  if (withFramework.length > 0) {
    await db
      .update(indicatorVersion)
      .set({ hasFramework: true })
      .where(inArray(indicatorVersion.id, withFramework));
  }

  return { links: links.length, unknownIds: ids.filter((id) => !dimensionById.has(id)) };
}
