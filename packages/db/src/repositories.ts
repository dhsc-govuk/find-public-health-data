import {
  type AreaDeprivation,
  type AreaLookup,
  type AreaNeighbours,
  type AreaParent,
  type AreaSummary,
  type AreaWithParent,
  type IndicatorAreaFilters,
  listAreaDeprivation,
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
import type { Database } from './client.ts';
import { coalescedReads } from './coalesced-reads.ts';
import {
  getIndicatorObservations,
  getIndicatorObservationsForAreas,
  getObservationRange,
  getObservationRangeByCategory,
  getObservationRangeByTier,
  getPublishedIndicatorById,
  type IndicatorAreaData,
  type IndicatorDetail,
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
import { publishedViews } from './schema/index.ts';
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
  findPublishedById(indicatorId: string): Promise<IndicatorDetail | undefined>;
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
  listByCodes(codes: string[]): Promise<AreaLookup[]>;
  search(query: string, limit: number): Promise<AreaLookup[]>;
  listParents(childCodes: string[], parentTypeName: string): Promise<AreaParent[]>;
  listDeprivation(codes: string[]): Promise<AreaDeprivation[]>;
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

export function createRepositories(db: Database): Repositories {
  const views = publishedViews;
  const repositories: Repositories = {
    areas: {
      listByType: (areaTypeName) => listAreasByType(db, views, areaTypeName),
      listDisplayGroups: () => listDisplayGroups(db, views),
      listByGroup: (displayGroup, limit) => listAreasByGroup(db, views, displayGroup, limit),
      listByGroups: (displayGroups, limit) => listAreasByGroups(db, views, displayGroups, limit),
      listByCodes: (codes) => listAreasByCodes(db, views, codes),
      search: (query, limit) => searchAreas(db, views, query, limit),
      listParents: (childCodes, parentTypeName) =>
        listAreaParents(db, views, childCodes, parentTypeName),
      listDeprivation: (codes) => listAreaDeprivation(db, views, codes),
      listNeighbours: (codes) => listAreaNeighbours(db, views, codes),
    },
    indicators: {
      findTableData: (shortIds, areaCodes, points) =>
        getIndicatorTableData(db, views, shortIds, areaCodes, points),
      listAreas: (indicatorId, filters) => listIndicatorAreas(db, views, indicatorId, filters),
      listPublished: () => listPublishedIndicators(db, views),
      search: (query, limit) => searchPublishedIndicators(db, views, query, limit),
      resolveId: (shortId) => resolvePublishedIndicatorId(db, views, shortId),
      resolveIdBySlug: (slug) => resolveIndicatorIdBySlug(db, views, slug),
      findPublishedById: (indicatorId) => getPublishedIndicatorById(db, views, indicatorId),
      findObservations: (indicatorId, areaCode) =>
        getIndicatorObservations(db, views, indicatorId, areaCode),
      findObservationsForAreas: (indicatorId, areaCodes) =>
        getIndicatorObservationsForAreas(db, views, indicatorId, areaCodes),
      findScatterData: (shortIds, areaCodes) =>
        getPublishedIndicatorScatterData(db, views, shortIds, areaCodes),
      findRankingData: (indicatorId, areaCodes) =>
        getIndicatorRankingData(db, views, indicatorId, areaCodes),
      findObservationRange: (indicatorId, displayGroup) =>
        getObservationRange(db, views, indicatorId, displayGroup),
      findObservationRangeByCategory: (indicatorId, dimensionValueId) =>
        getObservationRangeByCategory(db, views, indicatorId, dimensionValueId),
      findObservationRangeByTier: (indicatorId, tier, parentCode) =>
        getObservationRangeByTier(db, views, indicatorId, tier, parentCode),
      searchWithFilters: (filters) => searchIndicators(db, views, filters),
      listFacets: () => listIndicatorFacets(db, views),
    },
    topics: {
      list: () => listTopics(db, views),
      findBySlug: (slug) => getTopicBySlug(db, views, slug),
      trendSummary: (slug) => getTopicTrendSummary(db, views, slug),
      listSubtopics: (slug) => listTopicSubtopics(db, views, slug),
    },
  };
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
