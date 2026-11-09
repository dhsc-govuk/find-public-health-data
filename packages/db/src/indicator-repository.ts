import type { CiConfidenceLevel } from '@fphd/utils/ci-confidence-level';
import type { IndicatorSort } from '@fphd/utils/indicator-sort';
import {
  type PublicYearType,
  publicYearType,
  type YearEnd,
  yearTypeValuesLabelled,
} from '@fphd/utils/period-type';
import type { Polarity } from '@fphd/utils/polarity';
import { isShortId, SHORT_ID_PATTERN } from '@fphd/utils/short-id';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@fphd/utils/slug';
import type { IndicatorSourcePart } from '@fphd/utils/source-part';
import type { UpdateFrequency } from '@fphd/utils/update-frequency';
import { unitLabel } from '@fphd/utils/value-type-and-unit';
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  max,
  min,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';

import type { Database } from './client.ts';
import {
  type IndicatorClassification,
  listClassificationsForIndicators,
  listTopicsForIndicators,
} from './indicator-topic-repository.ts';
import { indicatorTrendDirections } from './indicator-trends.ts';
import {
  publishedArea as area,
  publishedAreaType as areaType,
  publishedAvailableData as availableData,
  publishedCiMethod as ciMethod,
  publishedClassification as classification,
  publishedComparatorMethod as comparatorMethod,
  publishedDataProvider as dataProvider,
  publishedDataProviderSource as dataProviderSource,
  publishedDataSource as dataSource,
  publishedIndicator as indicator,
  publishedIndicatorClassification as indicatorClassification,
  publishedIndicatorSlug as indicatorSlug,
  publishedIndicatorSource as indicatorSource,
  publishedIndicatorSubtopic as indicatorSubtopic,
  publishedIndicatorTopic as indicatorTopic,
  publishedObservation as observation,
  publishedObservationRange as observationRange,
  publishedSubtopic as subtopic,
  publishedTopic as topic,
  publishedUnit as unit,
  publishedValueType as valueType,
} from './schema/index.ts';

export interface IndicatorSearchFilters {
  query: string;
  topics: string[];
  subtopics?: string[];
  indicatorTypes: string[];
  lifeStages: string[];
  frameworks: string[];
  populations: string[];
  inequalities: string[];
  displayGroups: string[];
  areaCodes: string[];
  sources: string[];
  valueTypes: string[];
  yearTypes: string[];
  limit: number;
  page?: number | undefined;
  sort?: IndicatorSort | undefined;
  dataFromYear?: number | undefined;
  dataToYear?: number | undefined;
  updatedWithinMonths?: number | undefined;
}

export interface IndicatorSearchRow {
  shortId: number;
  slug: string;
  name: string;
  topics: { slug: string; title: string }[];
  classifications: { dimension: string; slug: string; name: string }[];
}

export interface IndicatorSearchResult {
  total: number;
  limit: number;
  indicators: IndicatorSearchRow[];
  page?: number | undefined;
}

export interface IndicatorFacets {
  topics: { slug: string; title: string }[];
  classifications: { dimension: string; slug: string; name: string }[];
  sources: string[];
  valueTypes: string[];
  yearTypes: string[];
}

export interface PublishedIndicator {
  shortId: number;
  slug: string;
  name: string;
}

/**
 * A query that is a whole number matches that short id exactly; a slug-shaped one matches
 * any slug a published version carries, so an indicator's earlier address finds it too.
 * A slug is never digits only, so a digit run matches a short id or nothing.
 */
function exactIdentifierMatch(db: Database, query: string) {
  if (SHORT_ID_PATTERN.test(query)) {
    return isShortId(query) ? eq(indicator.shortId, Number(query)) : sql<boolean>`false`;
  }

  const slug = query.toLowerCase();

  return SLUG_PATTERN.test(slug) && slug.length <= SLUG_MAX_LENGTH
    ? exists(
        db
          .select({ one: sql`1` })
          .from(indicatorSlug)
          .where(and(eq(indicatorSlug.indicatorId, indicator.id), eq(indicatorSlug.slug, slug))),
      )
    : sql<boolean>`false`;
}

function escapedSearchTerms(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[\\%_]/g, '\\$&'));
}

/** The published indicator surface, ordered by name. */
export async function listPublishedIndicators(db: Database): Promise<PublishedIndicator[]> {
  return db
    .select({ shortId: indicator.shortId, slug: indicator.slug, name: indicator.name })
    .from(indicator)
    .orderBy(asc(indicator.name));
}

/** Case-insensitive indicator lookup by name or exact identifier. */
export async function searchPublishedIndicators(
  db: Database,
  query: string,
  limit: number,
): Promise<PublishedIndicator[]> {
  const terms = escapedSearchTerms(query);
  const identifierMatch = exactIdentifierMatch(db, query.trim());
  return db
    .select({ shortId: indicator.shortId, slug: indicator.slug, name: indicator.name })
    .from(indicator)
    .where(or(identifierMatch, and(...terms.map((term) => ilike(indicator.name, `%${term}%`)))))
    .orderBy(
      sql`case when ${identifierMatch} then 0 when lower(${indicator.name}) = lower(${query}) then 1 when ${indicator.name} ilike ${`${query.replace(/[\\%_]/g, '\\$&')}%`} then 2 else 3 end`,
      sql`position(lower(${query}) in lower(${indicator.name}))`,
      asc(indicator.name),
    )
    .limit(limit);
}

export interface IndicatorSource {
  name: string;
  url: string | null;
}

/** A provider of a numerator's or denominator's data, and its source, if a specific one. */
export interface IndicatorProviderSource {
  provider: string;
  source: string | null;
}

export interface IndicatorAreaType {
  name: string;
  areaCount: number;
}

export interface IndicatorTopic {
  slug: string;
  title: string;
  isPrimary?: boolean;
  subtopics?: { slug: string; title: string; isPrimary: boolean }[];
}

export interface IndicatorDetail {
  shortId: number;
  /** The canonical slug: the one the latest published version carries. */
  slug: string;
  name: string;
  valueType: string;
  /** As the public reads it beside a value; null when the values have no unit. */
  unit: string | null;
  /** Null for an indicator of months, which have no year type. */
  yearType: PublicYearType | null;
  updateFrequency: UpdateFrequency;
  polarity: Polarity;
  ciMethod: string | null;
  ciConfidenceLevel: CiConfidenceLevel | null;
  comparatorMethod: string | null;
  dataUpdatedAt: string | null;
  /** When the first published version went live. */
  firstPublishedAt: string;
  /** When the latest published version went live; the same as the first until an update. */
  lastPublishedAt: string;
  definition: string | null;
  rationale: string | null;
  methodology: string | null;
  numeratorDefinition: string | null;
  denominatorDefinition: string | null;
  disclosureControl: string | null;
  caveats: string | null;
  notes: string | null;
  dataSource: IndicatorSource | null;
  numeratorSources: IndicatorProviderSource[];
  denominatorSources: IndicatorProviderSource[];
  areaTypes: IndicatorAreaType[];
  topics: IndicatorTopic[];
  classifications: IndicatorClassification[];
}

/** The internal id behind a public short id — the one place the external id resolves. */
export async function resolvePublishedIndicatorId(
  db: Database,
  shortId: number,
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: indicator.id })
    .from(indicator)
    .where(eq(indicator.shortId, shortId))
    .limit(1);
  return row?.id;
}

/**
 * The internal id behind a slug. Any slug a published version carries resolves, so a link
 * made before a rename still lands on the indicator; the caller lower-cases first.
 */
export async function resolveIndicatorIdBySlug(
  db: Database,
  slug: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: indicatorSlug.indicatorId })
    .from(indicatorSlug)
    .where(eq(indicatorSlug.slug, slug))
    .limit(1);
  return row?.id;
}

/**
 * Everything the indicator page needs in one round trip. The view is the published
 * surface, so an unpublished indicator is indistinguishable from one that does not exist.
 */
export async function getPublishedIndicatorById(
  db: Database,
  indicatorId: string,
): Promise<IndicatorDetail | undefined> {
  return (await getPublishedIndicatorsByIds(db, [indicatorId])).get(indicatorId);
}

export async function getPublishedIndicatorsByIds(
  db: Database,
  indicatorIds: string[],
): Promise<Map<string, IndicatorDetail>> {
  if (!indicatorIds.length) return new Map();
  const rows = await db
    .select({
      id: indicator.id,
      shortId: indicator.shortId,
      slug: indicator.slug,
      name: indicator.name,
      valueType: valueType.name,
      unitId: unit.id,
      unitName: unit.name,
      unitDetail: indicator.unitDetail,
      yearType: indicator.yearType,
      yearEndDay: indicator.yearEndDay,
      yearEndMonth: indicator.yearEndMonth,
      updateFrequency: indicator.updateFrequency,
      polarity: indicator.polarity,
      ciMethod: ciMethod.name,
      ciConfidenceLevel: indicator.ciConfidenceLevel,
      comparatorMethod: comparatorMethod.name,
      dataUpdatedAt: indicator.dataUpdatedAt,
      firstPublishedAt: indicator.firstPublishedAt,
      lastPublishedAt: indicator.lastPublishedAt,
      definition: indicator.definition,
      rationale: indicator.rationale,
      methodology: indicator.methodology,
      numeratorDefinition: indicator.numeratorDefinition,
      denominatorDefinition: indicator.denominatorDefinition,
      disclosureControl: indicator.disclosureControlDetail,
      caveats: indicator.caveatsDetail,
      notes: indicator.otherNotesDetail,
      dataSourceName: dataSource.name,
      dataSourceUrl: dataSource.url,
    })
    .from(indicator)
    .innerJoin(valueType, eq(indicator.valueTypeId, valueType.id))
    .innerJoin(unit, eq(indicator.unitId, unit.id))
    .leftJoin(ciMethod, eq(indicator.ciMethodId, ciMethod.id))
    .leftJoin(comparatorMethod, eq(indicator.comparatorMethodId, comparatorMethod.id))
    .leftJoin(dataSource, eq(indicator.dataSourceId, dataSource.id))
    .where(inArray(indicator.id, indicatorIds));

  const [areaTypes, topics, classifications, sources] = await Promise.all([
    db
      .select({
        indicatorId: availableData.indicatorId,
        name: availableData.areaTypeName,
        areaCount: availableData.areaCount,
      })
      .from(availableData)
      .where(inArray(availableData.indicatorId, indicatorIds))
      .orderBy(asc(availableData.areaTypeName)),
    listTopicsForIndicators(db, indicatorIds),
    listClassificationsForIndicators(db, indicatorIds),
    db
      .select({
        indicatorId: indicatorSource.indicatorId,
        part: indicatorSource.part,
        provider: dataProvider.name,
        source: dataProviderSource.name,
      })
      .from(indicatorSource)
      .innerJoin(dataProvider, eq(dataProvider.id, indicatorSource.providerId))
      .leftJoin(dataProviderSource, eq(dataProviderSource.id, indicatorSource.sourceId))
      .where(inArray(indicatorSource.indicatorId, indicatorIds))
      .orderBy(asc(indicatorSource.position)),
  ]);
  return new Map(
    rows.flatMap((row): [string, IndicatorDetail][] => {
      if (row.polarity === null || row.updateFrequency === null) return [];
      const sourcesOf = (part: IndicatorSourcePart) =>
        sources
          .filter((entry) => entry.indicatorId === row.id && entry.part === part)
          .map(({ provider, source }) => ({ provider, source }));

      return [
        [
          row.id,
          {
            shortId: row.shortId,
            slug: row.slug,
            name: row.name,
            valueType: row.valueType,
            unit: unitLabel({ id: row.unitId, name: row.unitName }, row.unitDetail),
            yearType: row.yearType === null ? null : publicYearType(row.yearType, yearEndOf(row)),
            updateFrequency: row.updateFrequency,
            polarity: row.polarity,
            ciMethod: row.ciMethod,
            ciConfidenceLevel: row.ciConfidenceLevel,
            comparatorMethod: row.comparatorMethod,
            dataUpdatedAt: row.dataUpdatedAt?.toISOString() ?? null,
            firstPublishedAt: row.firstPublishedAt.toISOString(),
            lastPublishedAt: row.lastPublishedAt.toISOString(),
            definition: row.definition,
            rationale: row.rationale,
            methodology: row.methodology,
            numeratorDefinition: row.numeratorDefinition,
            denominatorDefinition: row.denominatorDefinition,
            disclosureControl: row.disclosureControl,
            caveats: row.caveats,
            notes: row.notes,
            dataSource:
              row.dataSourceName === null
                ? null
                : { name: row.dataSourceName, url: row.dataSourceUrl },
            numeratorSources: sourcesOf('numerator'),
            denominatorSources: sourcesOf('denominator'),
            areaTypes: areaTypes
              .filter((entry) => entry.indicatorId === row.id)
              .map(({ indicatorId: _id, ...entry }) => entry),
            topics: topics.get(row.id) ?? [],
            classifications: classifications.get(row.id) ?? [],
          },
        ],
      ];
    }),
  );
}

export {
  getIndicatorObservationData,
  getIndicatorObservations,
  getIndicatorObservationsForAreas,
  type IndicatorAreaData,
  type IndicatorObservation,
  type ObservationDimensionValue,
} from './indicator-observation-repository.ts';

export interface ObservationRangePeriod {
  fromDate: string;
  toDate: string;
  /** The segment's dimension values joined by '|' in dimension-type order, '' for the
   *  fully-aggregate series — the same shape a client derives from an observation. */
  segment: string;
  min: number;
  max: number;
  p25: number | null;
  p75: number | null;
  quintileCutoffs: number[] | null;
}

/** The precomputed per-period range for each least-disaggregated segment at a display level. */
export async function getObservationRange(
  db: Database,
  indicatorId: string,
  displayGroup: string,
): Promise<ObservationRangePeriod[]> {
  return db
    .select({
      fromDate: observationRange.fromDate,
      toDate: observationRange.toDate,
      segment: observationRange.segment,
      min: observationRange.min,
      max: observationRange.max,
      p25: observationRange.p25,
      p75: observationRange.p75,
      quintileCutoffs: observationRange.quintileCutoffs,
    })
    .from(observationRange)
    .where(
      and(
        eq(observationRange.indicatorId, indicatorId),
        eq(observationRange.displayGroup, displayGroup),
      ),
    )
    .orderBy(asc(observationRange.fromDate), asc(observationRange.toDate));
}

export async function searchIndicators(
  db: Database,
  filters: IndicatorSearchFilters,
): Promise<IndicatorSearchResult> {
  const classificationExists = (dimension: string, slugs: string[]) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(indicatorClassification)
        .innerJoin(
          classification,
          and(
            eq(indicatorClassification.classificationId, classification.id),
            eq(classification.dimension, dimension),
            inArray(classification.slug, slugs),
          ),
        )
        .where(eq(indicatorClassification.indicatorId, indicator.id)),
    );

  // The view is the published surface, so a search starts unfiltered.
  const conditions: SQL[] = [];

  const query = filters.query.trim();
  const identifierMatch = exactIdentifierMatch(db, query);
  const topicQueryMatch = (term: string) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(indicatorTopic)
        .innerJoin(topic, eq(indicatorTopic.topicId, topic.id))
        .where(
          and(
            eq(indicatorTopic.indicatorId, indicator.id),
            or(ilike(topic.title, `%${term}%`), ilike(topic.slug, `%${term}%`)),
          ),
        ),
    );
  const classificationQueryMatch = (term: string) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(indicatorClassification)
        .innerJoin(classification, eq(indicatorClassification.classificationId, classification.id))
        .where(
          and(
            eq(indicatorClassification.indicatorId, indicator.id),
            or(ilike(classification.name, `%${term}%`), ilike(classification.slug, `%${term}%`)),
          ),
        ),
    );

  if (query) {
    const termMatches = escapedSearchTerms(query).map(
      (term) =>
        or(
          ilike(indicator.name, `%${term}%`),
          topicQueryMatch(term),
          classificationQueryMatch(term),
        ) ?? sql<boolean>`false`,
    );
    conditions.push(or(identifierMatch, and(...termMatches)) ?? sql<boolean>`false`);
  }

  if (filters.topics.length > 0) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(indicatorTopic)
          .innerJoin(
            topic,
            and(eq(indicatorTopic.topicId, topic.id), inArray(topic.slug, filters.topics)),
          )
          .where(eq(indicatorTopic.indicatorId, indicator.id)),
      ),
    );
  }

  if (filters.subtopics?.length) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(indicatorSubtopic)
          .innerJoin(subtopic, eq(indicatorSubtopic.subtopicId, subtopic.id))
          .innerJoin(topic, eq(subtopic.topicId, topic.id))
          .where(
            and(
              eq(indicatorSubtopic.indicatorId, indicator.id),
              inArray(subtopic.slug, filters.subtopics),
              filters.topics.length > 0 ? inArray(topic.slug, filters.topics) : undefined,
            ),
          ),
      ),
    );
  }

  if (filters.indicatorTypes.length > 0) {
    conditions.push(classificationExists('indicator_type', filters.indicatorTypes));
  }
  if (filters.lifeStages.length > 0) {
    conditions.push(classificationExists('life_stage', filters.lifeStages));
  }
  if (filters.frameworks.length > 0) {
    conditions.push(classificationExists('framework', filters.frameworks));
  }
  if (filters.populations.length > 0) {
    conditions.push(classificationExists('population', filters.populations));
  }
  if (filters.inequalities.length > 0) {
    conditions.push(classificationExists('inequality', filters.inequalities));
  }

  if (filters.displayGroups.length > 0) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(availableData)
          .innerJoin(
            areaType,
            and(
              eq(availableData.areaTypeId, areaType.id),
              inArray(areaType.displayGroup, filters.displayGroups),
            ),
          )
          .where(eq(availableData.indicatorId, indicator.id)),
      ),
    );
  }

  for (const code of filters.areaCodes) {
    // A bounded scalar lookup keeps the probe on each candidate indicator's area index.
    const usablePoint = db
      .select({ id: observation.id })
      .from(observation)
      .innerJoin(area, eq(observation.areaId, area.id))
      .where(
        and(
          eq(observation.indicatorId, indicator.id),
          eq(area.code, code),
          isNotNull(observation.value),
        ),
      )
      .limit(1);
    conditions.push(isNotNull(sql`(${usablePoint})`));
  }

  if (filters.sources.length > 0) {
    conditions.push(
      inArray(
        indicator.dataSourceId,
        db
          .select({ id: dataSource.id })
          .from(dataSource)
          .where(inArray(dataSource.name, filters.sources)),
      ),
    );
  }

  if (filters.valueTypes.length > 0) {
    conditions.push(
      inArray(
        indicator.valueTypeId,
        db
          .select({ id: valueType.id })
          .from(valueType)
          .where(inArray(valueType.name, filters.valueTypes)),
      ),
    );
  }

  if (filters.yearTypes.length > 0) {
    conditions.push(
      or(
        ...filters.yearTypes
          .flatMap(yearTypeValuesLabelled)
          .map(({ yearType, yearEnd }) =>
            yearEnd === null
              ? eq(indicator.yearType, yearType)
              : and(
                  eq(indicator.yearType, yearType),
                  eq(indicator.yearEndDay, yearEnd.day),
                  eq(indicator.yearEndMonth, yearEnd.month),
                ),
          ),
      ) ?? sql<boolean>`false`,
    );
  }

  if (filters.updatedWithinMonths) {
    conditions.push(
      sql`${indicator.dataUpdatedAt} >= current_timestamp - (${filters.updatedWithinMonths} * interval '1 month')`,
    );
  }
  if (filters.dataFromYear) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(observation)
          .where(
            and(
              eq(observation.indicatorId, indicator.id),
              sql`${observation.fromDate} <= ${`${filters.dataFromYear}-12-31`}::date`,
              sql`${observation.toDate} >= ${`${filters.dataFromYear}-01-01`}::date`,
            ),
          ),
      ),
    );
  }
  if (filters.dataToYear) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(observation)
          .where(
            and(
              eq(observation.indicatorId, indicator.id),
              sql`${observation.toDate} >= ${`${filters.dataToYear}-01-01`}::date`,
              sql`${observation.fromDate} <= ${`${filters.dataToYear}-12-31`}::date`,
            ),
          ),
      ),
    );
  }
  const where = and(...conditions);

  const firstTopicTitle = db
    .select({ t: min(topic.title) })
    .from(indicatorTopic)
    .innerJoin(topic, eq(indicatorTopic.topicId, topic.id))
    .where(eq(indicatorTopic.indicatorId, indicator.id));

  const firstSubtopicTitle = db
    .select({ title: min(subtopic.title) })
    .from(indicatorSubtopic)
    .innerJoin(subtopic, eq(indicatorSubtopic.subtopicId, subtopic.id))
    .innerJoin(topic, eq(indicatorSubtopic.topicId, topic.id))
    .where(
      and(
        eq(indicatorSubtopic.indicatorId, indicator.id),
        filters.topics.length === 1 ? eq(topic.slug, filters.topics[0] as string) : undefined,
      ),
    );

  const escapedQuery = query.replace(/[\\%_]/g, '\\$&');
  const relevance = sql`case when ${identifierMatch} then 0 when lower(${indicator.name}) = lower(${query}) then 1 when ${indicator.name} ilike ${`${escapedQuery}%`} then 2 when ${indicator.name} ilike ${`%${escapedQuery}%`} then 3 else 4 end`;
  const countQuery = db
    .select({ total: countDistinct(indicator.id) })
    .from(indicator)
    .where(where);
  const latestPeriods = db
    .select({
      indicatorId: observation.indicatorId,
      date: max(observation.toDate).as('latest_period'),
    })
    .from(observation)
    .where(
      inArray(
        observation.indicatorId,
        db.select({ id: indicator.id }).from(indicator).where(where),
      ),
    )
    .groupBy(observation.indicatorId)
    .as('latest_periods');
  const order =
    filters.sort === 'name-desc'
      ? [desc(indicator.name), asc(indicator.shortId)]
      : filters.sort === 'name-asc'
        ? [asc(indicator.name), asc(indicator.shortId)]
        : filters.sort === 'subtopic-asc'
          ? [
              sql`(${firstSubtopicTitle}) asc nulls last`,
              asc(indicator.name),
              asc(indicator.shortId),
            ]
          : filters.sort === 'subtopic-desc'
            ? [
                sql`(${firstSubtopicTitle}) desc nulls last`,
                asc(indicator.name),
                asc(indicator.shortId),
              ]
            : filters.sort === 'period-desc'
              ? [
                  sql`${latestPeriods.date} desc nulls last`,
                  asc(indicator.name),
                  asc(indicator.shortId),
                ]
              : query
                ? [
                    relevance,
                    sql`position(lower(${query}) in lower(${indicator.name}))`,
                    asc(indicator.name),
                  ]
                : [sql`(${firstTopicTitle}) nulls last`, asc(indicator.name)];
  const trendSort = filters.sort?.startsWith('trend-') ?? false;
  const rowQuery = (page = 1) => {
    const query = db
      .select({
        id: indicator.id,
        shortId: indicator.shortId,
        slug: indicator.slug,
        name: indicator.name,
        polarity: indicator.polarity,
      })
      .from(indicator);
    const selected = (
      filters.sort === 'period-desc'
        ? query.leftJoin(latestPeriods, eq(latestPeriods.indicatorId, indicator.id))
        : query
    )
      .where(where)
      .orderBy(...order);
    return trendSort ? selected : selected.limit(filters.limit).offset((page - 1) * filters.limit);
  };
  const countResult = filters.page === undefined ? undefined : await countQuery;
  const page =
    filters.page === undefined
      ? undefined
      : Math.min(
          filters.page,
          Math.max(1, Math.ceil((countResult?.[0]?.total ?? 0) / filters.limit)),
        );
  const [counts, matches] = await Promise.all([countResult ?? countQuery, rowQuery(page)]);
  let rows = matches;
  if (trendSort) {
    const directions = await indicatorTrendDirections(
      db,
      matches.map(({ id }) => id),
    );
    const rank = (row: (typeof matches)[number]) => {
      const direction = directions.get(row.id);
      if (direction == null) return 3;
      if (direction === 'right') return 1;
      if (filters.sort === 'trend-better' || filters.sort === 'trend-worse') {
        if (row.polarity !== 'higher-is-better' && row.polarity !== 'lower-is-better') return 3;
        const better = (direction === 'up') === (row.polarity === 'higher-is-better');
        return better === (filters.sort === 'trend-better') ? 0 : 2;
      }
      return (direction === 'up') === (filters.sort === 'trend-desc') ? 0 : 2;
    };
    rows = [...matches]
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.shortId - b.shortId)
      .slice(((page ?? 1) - 1) * filters.limit, (page ?? 1) * filters.limit);
  }

  const total = counts[0]?.total ?? 0;
  const pagination = page === undefined ? {} : { page };

  if (rows.length === 0) {
    return { total, limit: filters.limit, indicators: [], ...pagination };
  }

  const ids = rows.map((r) => r.id);

  const [topicRows, classificationRows] = await Promise.all([
    db
      .select({
        indicatorId: indicatorTopic.indicatorId,
        slug: topic.slug,
        title: topic.title,
      })
      .from(indicatorTopic)
      .innerJoin(topic, eq(indicatorTopic.topicId, topic.id))
      .where(inArray(indicatorTopic.indicatorId, ids))
      .orderBy(asc(topic.title)),
    db
      .select({
        indicatorId: indicatorClassification.indicatorId,
        dimension: classification.dimension,
        slug: classification.slug,
        name: classification.name,
      })
      .from(indicatorClassification)
      .innerJoin(classification, eq(indicatorClassification.classificationId, classification.id))
      .where(inArray(indicatorClassification.indicatorId, ids))
      .orderBy(asc(classification.dimension), asc(classification.name)),
  ]);

  const topicsByIndicator = new Map<string, { slug: string; title: string }[]>();
  for (const { indicatorId, slug, title } of topicRows) {
    const existing = topicsByIndicator.get(indicatorId);
    if (existing) {
      existing.push({ slug, title });
    } else {
      topicsByIndicator.set(indicatorId, [{ slug, title }]);
    }
  }

  const classificationsByIndicator = new Map<
    string,
    { dimension: string; slug: string; name: string }[]
  >();
  for (const { indicatorId, dimension, slug, name } of classificationRows) {
    const existing = classificationsByIndicator.get(indicatorId);
    if (existing) {
      existing.push({ dimension, slug, name });
    } else {
      classificationsByIndicator.set(indicatorId, [{ dimension, slug, name }]);
    }
  }

  return {
    total,
    limit: filters.limit,
    ...pagination,
    indicators: rows.map((r) => ({
      shortId: r.shortId,
      slug: r.slug,
      name: r.name,
      topics: topicsByIndicator.get(r.id) ?? [],
      classifications: classificationsByIndicator.get(r.id) ?? [],
    })),
  };
}

function yearEndOf({
  yearEndDay,
  yearEndMonth,
}: {
  yearEndDay: number | null;
  yearEndMonth: number | null;
}): YearEnd | null {
  return yearEndDay === null || yearEndMonth === null
    ? null
    : { day: yearEndDay, month: yearEndMonth };
}

/** The labels of the year types published indicators have, for the search filter to offer. */
async function listPublishedYearTypeLabels(db: Database): Promise<string[]> {
  const rows = await db
    .selectDistinct({
      yearType: indicator.yearType,
      yearEndDay: indicator.yearEndDay,
      yearEndMonth: indicator.yearEndMonth,
    })
    .from(indicator);

  const labels = rows.flatMap(({ yearType, ...yearEnd }) =>
    yearType === null ? [] : [publicYearType(yearType, yearEndOf(yearEnd)).label],
  );
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}

export async function listIndicatorFacets(db: Database): Promise<IndicatorFacets> {
  const publishedIds = db.select({ id: indicator.id }).from(indicator);

  const [topics, classifications, sources, valueTypes, yearTypes] = await Promise.all([
    db
      .selectDistinct({ slug: topic.slug, title: topic.title })
      .from(topic)
      .innerJoin(indicatorTopic, eq(indicatorTopic.topicId, topic.id))
      .where(inArray(indicatorTopic.indicatorId, publishedIds))
      .orderBy(asc(topic.title)),
    db
      .selectDistinct({
        dimension: classification.dimension,
        slug: classification.slug,
        name: classification.name,
      })
      .from(classification)
      .innerJoin(
        indicatorClassification,
        eq(indicatorClassification.classificationId, classification.id),
      )
      .where(inArray(indicatorClassification.indicatorId, publishedIds))
      .orderBy(asc(classification.dimension), asc(classification.name)),
    db
      .selectDistinct({ name: dataSource.name })
      .from(dataSource)
      .innerJoin(indicator, eq(indicator.dataSourceId, dataSource.id))
      .orderBy(asc(dataSource.name)),
    db
      .selectDistinct({ name: valueType.name })
      .from(valueType)
      .innerJoin(indicator, eq(indicator.valueTypeId, valueType.id))
      .orderBy(asc(valueType.name)),
    listPublishedYearTypeLabels(db),
  ]);

  return {
    topics,
    classifications,
    sources: sources.map((s) => s.name),
    valueTypes: valueTypes.map((v) => v.name),
    yearTypes,
  };
}
