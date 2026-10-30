import { CI_CONFIDENCE_LEVELS } from '@fphd/utils/ci-confidence-level';
import { YEAR_TYPES } from '@fphd/utils/period-type';
import { POLARITIES } from '@fphd/utils/polarity';
import { INDICATOR_SOURCE_PARTS } from '@fphd/utils/source-part';
import { UPDATE_FREQUENCIES } from '@fphd/utils/update-frequency';
import {
  boolean,
  date,
  doublePrecision,
  integer,
  pgSchema,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The only objects `public_api` may read. The views carry the predicates that keep an
 * unpublished indicator out, so no query has to remember them; the definitions live in a
 * custom migration and are declared here as existing so drizzle-kit never rewrites them.
 * Exports are prefixed because the table names are taken. Column names are spelled out:
 * drizzle keys its casing cache on the unqualified relation name, so a view sharing a
 * table's name would otherwise inherit that table's column list.
 */
export const publishedSchema = pgSchema('published');

export const publishedIndicator = publishedSchema
  .view('indicator', {
    id: uuid('id').notNull(),
    shortId: integer('short_id').notNull(),
    dataUpdatedAt: timestamp('data_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    // A version is complete before it can be published, so the public surface always has a name.
    name: text('name').notNull(),
    // The canonical slug: the one the latest published version carries.
    slug: text('slug').notNull(),
    valueTypeId: uuid('value_type_id'),
    unitId: uuid('unit_id'),
    unitDetail: text('unit_detail'),
    yearType: text('year_type', { enum: YEAR_TYPES }),
    yearEndDay: smallint('year_end_day'),
    yearEndMonth: smallint('year_end_month'),
    ciMethodId: uuid('ci_method_id'),
    polarity: text('polarity', { enum: POLARITIES }),
    updateFrequency: text('update_frequency', { enum: UPDATE_FREQUENCIES }),
    comparatorMethodId: uuid('comparator_method_id'),
    ciConfidenceLevel: text('ci_confidence_level', { enum: CI_CONFIDENCE_LEVELS }),
    definition: text('definition'),
    rationale: text('rationale'),
    methodology: text('methodology'),
    numeratorDefinition: text('numerator_definition'),
    denominatorDefinition: text('denominator_definition'),
    disclosureControlDetail: text('disclosure_control_detail'),
    caveatsDetail: text('caveats_detail'),
    otherNotesDetail: text('other_notes_detail'),
    dataSourceId: uuid('data_source_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    firstPublishedAt: timestamp('first_published_at', { withTimezone: true }),
    lastPublishedAt: timestamp('last_published_at', { withTimezone: true }),
  })
  .existing();

/** Every slug any published version carries, so an indicator's earlier addresses resolve. */
export const publishedIndicatorSlug = publishedSchema
  .view('indicator_slug', {
    slug: text('slug').notNull(),
    indicatorId: uuid('indicator_id').notNull(),
  })
  .existing();

export const publishedIndicatorTopic = publishedSchema
  .view('indicator_topic', {
    indicatorId: uuid('indicator_id').notNull(),
    topicId: uuid('topic_id').notNull(),
    isPrimary: boolean('is_primary').notNull(),
  })
  .existing();

export const publishedSubtopic = publishedSchema
  .view('subtopic', {
    id: uuid('id').notNull(),
    topicId: uuid('topic_id').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  })
  .existing();

export const publishedIndicatorSubtopic = publishedSchema
  .view('indicator_subtopic', {
    indicatorId: uuid('indicator_id').notNull(),
    topicId: uuid('topic_id').notNull(),
    subtopicId: uuid('subtopic_id').notNull(),
    isPrimary: boolean('is_primary').notNull(),
  })
  .existing();

export const publishedIndicatorClassification = publishedSchema
  .view('indicator_classification', {
    indicatorId: uuid('indicator_id').notNull(),
    classificationId: uuid('classification_id').notNull(),
  })
  .existing();

export const publishedTopic = publishedSchema
  .view('topic', {
    id: uuid('id').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  })
  .existing();

export const publishedClassification = publishedSchema
  .view('classification', {
    id: uuid('id').notNull(),
    dimension: text('dimension').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  })
  .existing();

export const publishedValueType = publishedSchema
  .view('value_type', { id: uuid('id').notNull(), name: text('name').notNull() })
  .existing();

export const publishedUnit = publishedSchema
  .view('unit', { id: uuid('id').notNull(), name: text('name').notNull() })
  .existing();

export const publishedCiMethod = publishedSchema
  .view('ci_method', {
    id: uuid('id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
  })
  .existing();

export const publishedComparatorMethod = publishedSchema
  .view('comparator_method', { id: uuid('id').notNull(), name: text('name').notNull() })
  .existing();

export const publishedDataSource = publishedSchema
  .view('data_source', { id: uuid('id').notNull(), name: text('name').notNull(), url: text('url') })
  .existing();

/** The providers and sources of each published indicator's numerator and denominator. */
export const publishedIndicatorSource = publishedSchema
  .view('indicator_source', {
    indicatorId: uuid('indicator_id').notNull(),
    part: text('part', { enum: INDICATOR_SOURCE_PARTS }).notNull(),
    position: smallint('position').notNull(),
    providerId: uuid('provider_id').notNull(),
    sourceId: uuid('source_id'),
  })
  .existing();

export const publishedDataProvider = publishedSchema
  .view('data_provider', { id: uuid('id').notNull(), name: text('name').notNull() })
  .existing();

export const publishedDataProviderSource = publishedSchema
  .view('data_provider_source', {
    id: uuid('id').notNull(),
    providerId: uuid('provider_id').notNull(),
    name: text('name').notNull(),
  })
  .existing();

export const publishedDimensionType = publishedSchema
  .view('dimension_type', {
    id: uuid('id').notNull(),
    name: text('name').notNull(),
    dimensionClass: text('dimension_class').notNull(),
    classificationScheme: text('classification_scheme'),
    granularity: text('granularity'),
    schemeVersion: text('scheme_version'),
    isRequired: boolean('is_required').notNull(),
  })
  .existing();

export const publishedDimensionValue = publishedSchema
  .view('dimension_value', {
    id: uuid('id').notNull(),
    dimensionTypeId: uuid('dimension_type_id').notNull(),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    code: text('code'),
    sortOrder: integer('sort_order').notNull(),
    isAggregate: boolean('is_aggregate').notNull(),
  })
  .existing();

export const publishedAreaType = publishedSchema
  .view('area_type', {
    id: uuid('id').notNull(),
    name: text('name').notNull(),
    hierarchyType: text('hierarchy_type').notNull(),
    level: integer('level').notNull(),
    displayGroup: text('display_group'),
    displayOrder: integer('display_order'),
  })
  .existing();

export const publishedArea = publishedSchema
  .view('area', {
    id: uuid('id').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    areaTypeId: uuid('area_type_id').notNull(),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
    isCurrent: boolean('is_current').notNull(),
  })
  .existing();

export const publishedAreaRelationship = publishedSchema
  .view('area_relationship', {
    id: uuid('id').notNull(),
    parentAreaId: uuid('parent_area_id').notNull(),
    childAreaId: uuid('child_area_id').notNull(),
    validFrom: date('valid_from'),
    validTo: date('valid_to'),
  })
  .existing();

export const publishedNoteType = publishedSchema
  .view('note_type', {
    id: uuid('id').notNull(),
    text: text('text').notNull(),
    category: text('category').notNull(),
  })
  .existing();

export const publishedObservation = publishedSchema
  .view('observation', {
    id: uuid('id').notNull(),
    indicatorId: uuid('indicator_id').notNull(),
    areaId: uuid('area_id').notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    value: doublePrecision('value'),
    count: doublePrecision('count'),
    numerator: doublePrecision('numerator'),
    denominator: doublePrecision('denominator'),
    denominator2: doublePrecision('denominator_2'),
    lowerCi95: doublePrecision('lower_ci_95'),
    upperCi95: doublePrecision('upper_ci_95'),
    lowerCi998: doublePrecision('lower_ci_998'),
    upperCi998: doublePrecision('upper_ci_998'),
    distributionRank: smallint('distribution_rank'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  })
  .existing();

export const publishedObservationDimension = publishedSchema
  .view('observation_dimension', {
    id: uuid('id').notNull(),
    observationId: uuid('observation_id').notNull(),
    dimensionValueId: uuid('dimension_value_id').notNull(),
    dimensionTypeId: uuid('dimension_type_id').notNull(),
  })
  .existing();

export const publishedObservationNote = publishedSchema
  .view('observation_note', {
    id: uuid('id').notNull(),
    observationId: uuid('observation_id').notNull(),
    noteTypeId: uuid('note_type_id').notNull(),
  })
  .existing();

export const publishedLatestHeadline = publishedSchema
  .view('latest_headline', {
    indicatorId: uuid('indicator_id').notNull(),
    areaId: uuid('area_id').notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    value: doublePrecision('value'),
    lowerCi95: doublePrecision('lower_ci_95'),
    upperCi95: doublePrecision('upper_ci_95'),
  })
  .existing();

export const publishedAvailableData = publishedSchema
  .view('available_data', {
    indicatorId: uuid('indicator_id').notNull(),
    areaTypeId: uuid('area_type_id').notNull(),
    areaTypeName: text('area_type_name').notNull(),
    areaCount: integer('area_count').notNull(),
  })
  .existing();

export const publishedIndicatorDimensionValues = publishedSchema
  .view('indicator_dimension_values', {
    indicatorId: uuid('indicator_id').notNull(),
    dimensionTypeId: uuid('dimension_type_id').notNull(),
    dimensionTypeName: text('dimension_type_name').notNull(),
    dimensionValueId: uuid('dimension_value_id').notNull(),
    dimensionValueName: text('dimension_value_name').notNull(),
    sortOrder: integer('sort_order').notNull(),
  })
  .existing();

export const publishedObservationRange = publishedSchema
  .view('observation_range', {
    indicatorId: uuid('indicator_id').notNull(),
    displayGroup: text('display_group').notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    segment: text('segment').notNull(),
    min: doublePrecision('min').notNull(),
    max: doublePrecision('max').notNull(),
  })
  .existing();
