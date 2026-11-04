import {
  type AreaLookup,
  type AreaParent,
  type AreaSummary,
  type IndicatorAreaFilters,
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
import {
  getIndicatorObservations,
  getIndicatorObservationsForAreas,
  getObservationRange,
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
import { getIndicatorRankingData, getIndicatorTableData } from './indicator-table-repository.ts';
import {
  getTopicBySlug,
  getTopicTrendSummary,
  listTopicSubtopics,
  listTopics,
  type Topic,
  type TopicTrendSummary,
} from './topic-repository.ts';

export interface IndicatorRepository {
  findTableData(
    shortIds: number[],
    areaCodes: string[],
    points?: 'recent' | 'latest',
  ): ReturnType<typeof getIndicatorTableData>;
  listAreas(
    indicatorId: string,
    filters?: IndicatorAreaFilters,
  ): Promise<{ displayGroup: string; areas: AreaSummary[] }[]>;
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
  return {
    areas: {
      listByType: (areaTypeName) => listAreasByType(db, areaTypeName),
      listDisplayGroups: () => listDisplayGroups(db),
      listByGroup: (displayGroup, limit) => listAreasByGroup(db, displayGroup, limit),
      listByGroups: (displayGroups, limit) => listAreasByGroups(db, displayGroups, limit),
      listByCodes: (codes) => listAreasByCodes(db, codes),
      search: (query, limit) => searchAreas(db, query, limit),
      listParents: (childCodes, parentTypeName) => listAreaParents(db, childCodes, parentTypeName),
    },
    indicators: {
      findTableData: (shortIds, areaCodes, points) =>
        getIndicatorTableData(db, shortIds, areaCodes, points),
      listAreas: (indicatorId, filters) => listIndicatorAreas(db, indicatorId, filters),
      listPublished: () => listPublishedIndicators(db),
      search: (query, limit) => searchPublishedIndicators(db, query, limit),
      resolveId: (shortId) => resolvePublishedIndicatorId(db, shortId),
      resolveIdBySlug: (slug) => resolveIndicatorIdBySlug(db, slug),
      findPublishedById: (indicatorId) => getPublishedIndicatorById(db, indicatorId),
      findObservations: (indicatorId, areaCode) =>
        getIndicatorObservations(db, indicatorId, areaCode),
      findObservationsForAreas: (indicatorId, areaCodes) =>
        getIndicatorObservationsForAreas(db, indicatorId, areaCodes),
      findRankingData: (indicatorId, areaCodes) =>
        getIndicatorRankingData(db, indicatorId, areaCodes),
      findObservationRange: (indicatorId, displayGroup) =>
        getObservationRange(db, indicatorId, displayGroup),
      searchWithFilters: (filters) => searchIndicators(db, filters),
      listFacets: () => listIndicatorFacets(db),
    },
    topics: {
      list: () => listTopics(db),
      findBySlug: (slug) => getTopicBySlug(db, slug),
      trendSummary: (slug) => getTopicTrendSummary(db, slug),
      listSubtopics: (slug) => listTopicSubtopics(db, slug),
    },
  };
}
