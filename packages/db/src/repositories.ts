import {
  type AreaLookup,
  type AreaNeighbours,
  type AreaParent,
  type AreaSummary,
  type AreaWithParent,
  type IndicatorAreaFilters,
  listAreaNeighbours,
  listAreaParents,
  listAreasByCodes,
  listAreasByGroup,
  listAreasByGroups,
  listAreasByType,
  listDisplayGroups,
  listIndicatorAreas,
  searchAreas,
} from './area-repository.ts';
import type { Database, DatabaseReader } from './client.ts';
import { coalescedReads } from './coalesced-reads.ts';
import {
  type FoundIndicatorDetail,
  getIndicatorDetailById,
  getIndicatorObservations,
  getIndicatorObservationsForAreas,
  getObservationRange,
  getObservationRangeByCategory,
  getObservationRangeByTier,
  type IndicatorAreaData,
  type IndicatorFacets,
  type IndicatorSearchFilters,
  type IndicatorSearchResult,
  listIndicatorFacets,
  listPublishedIndicators,
  type ObservationRangePeriod,
  type PublishedIndicator,
  resolveIndicatorIdBySlug,
  resolvePublishedIndicatorId,
  searchIndicators,
  searchPublishedIndicators,
} from './indicator-repository.ts';
import { getPublishedIndicatorScatterData } from './indicator-scatter-repository.ts';
import { getIndicatorRankingData, getIndicatorTableData } from './indicator-table-repository.ts';
import { publishedViews, type ViewSet } from './schema/index.ts';
import {
  getTopicBySlug,
  getTopicTrendSummary,
  listTopicSubtopics,
  listTopics,
  type Topic,
  type TopicTrendSummary,
} from './topic-repository.ts';

export interface IndicatorRepository {
  findScatterData(
    shortIds: [number, number],
    areaCodes: string[],
  ): ReturnType<typeof getPublishedIndicatorScatterData>;
  findTableData(
    shortIds: number[],
    areaCodes: string[],
    points?: 'recent' | 'latest' | 'sparkline',
  ): ReturnType<typeof getIndicatorTableData>;
  listAreas(
    indicatorId: string,
    filters?: IndicatorAreaFilters,
  ): Promise<{ displayGroup: string; areas: AreaWithParent[] }[]>;
  listPublished(): Promise<PublishedIndicator[]>;
  search(query: string, limit: number): Promise<PublishedIndicator[]>;
  /** The one place the public short id resolves to an internal id. */
  resolveId(shortId: number): Promise<string | undefined>;
  /** The same for a slug, current or superseded; the caller lower-cases it first. */
  resolveIdBySlug(slug: string): Promise<string | undefined>;
  /**
   * The detail as the views hold it. The public page shows it only once
   * `completeIndicatorDetail` finds it complete.
   */
  findDetailById(indicatorId: string): Promise<FoundIndicatorDetail | undefined>;
  findObservations(indicatorId: string, areaCode: string): Promise<IndicatorAreaData | undefined>;
  findObservationsForAreas(indicatorId: string, areaCodes: string[]): Promise<IndicatorAreaData[]>;
  findRankingData(indicatorId: string, areaCodes: string[]): Promise<IndicatorAreaData[]>;
  findObservationRange(
    indicatorId: string,
    displayGroup: string,
  ): Promise<ObservationRangePeriod[]>;
  findObservationRangeByCategory(
    indicatorId: string,
    dimensionValueId: string,
  ): Promise<ObservationRangePeriod[]>;
  findObservationRangeByTier(
    indicatorId: string,
    tier: 'upper' | 'lower',
    parentCode?: string,
  ): Promise<ObservationRangePeriod[]>;
  searchWithFilters(filters: IndicatorSearchFilters): Promise<IndicatorSearchResult>;
  listFacets(): Promise<IndicatorFacets>;
}

export interface AreaRepository {
  listByType(areaTypeName: string): Promise<AreaSummary[]>;
  listDisplayGroups(): Promise<string[]>;
  listByGroup(displayGroup: string, limit?: number): Promise<AreaSummary[]>;
  listByGroups(
    displayGroups: string[],
    limit?: number,
  ): Promise<{ displayGroup: string; areas: AreaSummary[] }[]>;
  listByCodes(codes: string[], includeBenchmarks?: boolean): Promise<AreaLookup[]>;
  search(query: string, limit: number): Promise<AreaLookup[]>;
  listParents(childCodes: string[], parentTypeName: string): Promise<AreaParent[]>;
  listNeighbours(codes: string[]): Promise<AreaNeighbours[]>;
}

export interface TopicRepository {
  list(): Promise<Topic[]>;
  findBySlug(slug: string): Promise<Topic | undefined>;
  trendSummary(slug: string): Promise<TopicTrendSummary>;
  listSubtopics(slug: string): Promise<{ slug: string; title: string }[]>;
}

/**
 * The database-backed services an app is given at startup. One prop per architectural
 * concern rather than one per feature: adding an endpoint adds a method or a repository
 * here, and no app factory or test signature changes.
 */
export interface Repositories {
  areas: AreaRepository;
  indicators: IndicatorRepository;
  topics: TopicRepository;
}

/**
 * Runs one read. The public apps run each on the database itself, and the preview runs each in a
 * transaction of its own that first chooses the version its views show.
 */
export type RunRead = <T>(read: (db: DatabaseReader) => Promise<T>) => Promise<T>;

/**
 * The repositories over `views`, each method running its reads through `run`. They share no
 * reads, so a caller whose reads depend on more than their arguments can use them as they are.
 */
export function createRepositoriesOn(run: RunRead, views: ViewSet): Repositories {
  return {
    areas: {
      listByType: (areaTypeName) => run((db) => listAreasByType(db, views, areaTypeName)),
      listDisplayGroups: () => run((db) => listDisplayGroups(db, views)),
      listByGroup: (displayGroup, limit) =>
        run((db) => listAreasByGroup(db, views, displayGroup, limit)),
      listByGroups: (displayGroups, limit) =>
        run((db) => listAreasByGroups(db, views, displayGroups, limit)),
      listByCodes: (codes, includeBenchmarks) =>
        run((db) => listAreasByCodes(db, views, codes, includeBenchmarks)),
      search: (query, limit) => run((db) => searchAreas(db, views, query, limit)),
      listParents: (childCodes, parentTypeName) =>
        run((db) => listAreaParents(db, views, childCodes, parentTypeName)),
      listNeighbours: (codes) => run((db) => listAreaNeighbours(db, views, codes)),
    },
    indicators: {
      findTableData: (shortIds, areaCodes, points) =>
        run((db) => getIndicatorTableData(db, views, shortIds, areaCodes, points)),
      listAreas: (indicatorId, filters) =>
        run((db) => listIndicatorAreas(db, views, indicatorId, filters)),
      listPublished: () => run((db) => listPublishedIndicators(db, views)),
      search: (query, limit) => run((db) => searchPublishedIndicators(db, views, query, limit)),
      resolveId: (shortId) => run((db) => resolvePublishedIndicatorId(db, views, shortId)),
      resolveIdBySlug: (slug) => run((db) => resolveIndicatorIdBySlug(db, views, slug)),
      findDetailById: (indicatorId) => run((db) => getIndicatorDetailById(db, views, indicatorId)),
      findObservations: (indicatorId, areaCode) =>
        run((db) => getIndicatorObservations(db, views, indicatorId, areaCode)),
      findObservationsForAreas: (indicatorId, areaCodes) =>
        run((db) => getIndicatorObservationsForAreas(db, views, indicatorId, areaCodes)),
      findScatterData: (shortIds, areaCodes) =>
        run((db) => getPublishedIndicatorScatterData(db, views, shortIds, areaCodes)),
      findRankingData: (indicatorId, areaCodes) =>
        run((db) => getIndicatorRankingData(db, views, indicatorId, areaCodes)),
      findObservationRange: (indicatorId, displayGroup) =>
        run((db) => getObservationRange(db, views, indicatorId, displayGroup)),
      findObservationRangeByCategory: (indicatorId, dimensionValueId) =>
        run((db) => getObservationRangeByCategory(db, views, indicatorId, dimensionValueId)),
      findObservationRangeByTier: (indicatorId, tier, parentCode) =>
        run((db) => getObservationRangeByTier(db, views, indicatorId, tier, parentCode)),
      searchWithFilters: (filters) => run((db) => searchIndicators(db, views, filters)),
      listFacets: () => run((db) => listIndicatorFacets(db, views)),
    },
    topics: {
      list: () => run((db) => listTopics(db, views)),
      findBySlug: (slug) => run((db) => getTopicBySlug(db, views, slug)),
      trendSummary: (slug) => run((db) => getTopicTrendSummary(db, views, slug)),
      listSubtopics: (slug) => run((db) => listTopicSubtopics(db, views, slug)),
    },
  };
}

export function createRepositories(db: Database): Repositories {
  const repositories = createRepositoriesOn((read) => read(db), publishedViews);
  // Resolving a short id or slug is a one-row index lookup, so it is never shared between
  // requests. Sharing it would make the number of statements a page costs depend on whether
  // its API requests happen to overlap.
  const { resolveId, resolveIdBySlug } = repositories.indicators;
  return {
    areas: coalescedReads(repositories.areas),
    indicators: { ...coalescedReads(repositories.indicators), resolveId, resolveIdBySlug },
    topics: coalescedReads(repositories.topics),
  };
}
