export { type AreaSummary, listAreasByType } from './area-repository.ts';
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
export { dimensionKey } from './dimension-key.ts';
export { dbEnvFields, resolveDbTls } from './env.ts';
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
export {
  type AreaRepository,
  createRepositories,
  type IndicatorRepository,
  type Repositories,
  type TopicRepository,
} from './repositories.ts';
export * as schema from './schema.ts';
export { getTopicBySlug, listTopics, type Topic } from './topic-repository.ts';
