export {
  type AreaFilters,
  type AreaLevelRow,
  type AreaParentRow,
  type AreaRow,
  ENGLAND_CODE,
} from './area-level-repository.ts';
export { type AreaSummary, listAreasByType } from './area-repository.ts';
export type { CatalogueEntry, CatalogueSelection } from './catalogue-repository.ts';
export {
  closeDb,
  createDb,
  createDbFromClient,
  createDbFromTransaction,
  createPostgresClient,
  type Database,
  type DbConnection,
  pingDb,
  type Schema,
  type SqlClient,
} from './client.ts';
export {
  type AgeEndDays,
  DATA_FILTER_COLUMNS,
  type DataFilter,
  type DataFilterColumn,
  type DataQuery,
  type DataRowRecord,
} from './data-repository.ts';
export { dimensionKey } from './dimension-key.ts';
export type {
  PublicDimensionTypeRow,
  PublicDimensionValueRow,
} from './dimension-repository.ts';
export {
  checkDbLogin,
  type DbLogin,
  type DbLoginSource,
  dbAuthEnvFields,
  dbEnvFields,
  resolveDbLogin,
  resolveDbTls,
} from './env.ts';
export {
  getIndicatorObservations,
  getPublishedIndicatorById,
  type IndicatorAreaData,
  type IndicatorDetail,
  type IndicatorFacets,
  type IndicatorObservation,
  type IndicatorProviderSource,
  type IndicatorSearchFilters,
  type IndicatorSearchResult,
  type IndicatorSearchRow,
  type IndicatorSource,
  listIndicatorFacets,
  listPublishedIndicators,
  type PublishedIndicator,
  resolveIndicatorIdBySlug,
  resolvePublishedIndicatorId,
  searchIndicators,
} from './indicator-repository.ts';
export {
  type IndicatorClassification,
  listClassificationsForIndicator,
  listTopicsForIndicator,
  type TopicSummaryForIndicator,
} from './indicator-topic-repository.ts';
export type { TagRow } from './reference-repository.ts';
export {
  type AreaRepository,
  createRepositories,
  type IndicatorRepository,
  type ReferenceRepository,
  type Repositories,
  type TopicRepository,
} from './repositories.ts';
export * as schema from './schema.ts';
export { getTopicBySlug, listTopics, type Topic } from './topic-repository.ts';
