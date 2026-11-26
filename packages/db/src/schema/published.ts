import { AGE_UNITS } from '@fphd/utils/age-range';
import { CI_CONFIDENCE_LEVELS } from '@fphd/utils/ci-confidence-level';
import type { SeriesPeriodType } from '@fphd/utils/observation-series';
import { YEAR_TYPES } from '@fphd/utils/period-type';
import { GOAL_POLARITIES, POLARITIES } from '@fphd/utils/polarity';
import { GOAL_LOWER_COMPARISONS, GOAL_UPPER_COMPARISONS } from '@fphd/utils/policy-goal';
import { INDICATOR_SOURCE_PARTS } from '@fphd/utils/source-part';
import { UPDATE_FREQUENCIES } from '@fphd/utils/update-frequency';
import type { FingertipsFormatting } from '@fphd/utils/value-type-and-unit';
import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  type PgSchema,
  pgSchema,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ObservationSeriesVariant } from './cache.ts';

/**
 * The only objects `public_api` may read. The views carry the predicates that keep an
 * unpublished indicator and observations before its start date out, so no query has to remember
 * them. Legacy definitions stay declared as existing so drizzle-kit leaves their SQL intact.
 * Exports are prefixed because the table names are taken. Column names are spelled out:
 * drizzle keys its casing cache on the unqualified relation name, so a view sharing a
 * table's name would otherwise inherit that table's column list.
 */
export const publishedSchema = pgSchema('published');

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
  })
  .existing();

export const publishedComparatorMethod = publishedSchema
  .view('comparator_method', { id: uuid('id').notNull(), name: text('name').notNull() })
  .existing();

export const publishedDataSource = publishedSchema
  .view('data_source', { id: uuid('id').notNull(), name: text('name').notNull(), url: text('url') })
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

export const publishedDimensionValueAgeRange = publishedSchema
  .view('dimension_value_age_range', {
    id: uuid('id').notNull(),
    ageFromValue: smallint('age_from_value').notNull(),
    ageFromUnit: text('age_from_unit', { enum: AGE_UNITS }).notNull(),
    ageUnderValue: smallint('age_under_value'),
    ageUnderUnit: text('age_under_unit', { enum: AGE_UNITS }),
  })
  .existing();

export const publishedAreaType = publishedSchema
  .view('area_type', {
    id: uuid('id').notNull(),
    name: text('name').notNull(),
    hierarchyType: text('hierarchy_type').notNull(),
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

export const publishedAreaNeighbour = publishedSchema
  .view('area_neighbour', {
    id: uuid('id').notNull(),
    areaId: uuid('area_id').notNull(),
    neighbourAreaId: uuid('neighbour_area_id').notNull(),
    scheme: text('scheme').notNull(),
    position: integer('position').notNull(),
  })
  .existing();

export const publishedNoteType = publishedSchema
  .view('note_type', {
    id: uuid('id').notNull(),
    text: text('text').notNull(),
    category: text('category').notNull(),
  })
  .existing();

/**
 * The published views that depend on which version of an indicator is visible, declared in the
 * schema given. The internal apps declare the same views in another schema, whose definitions
 * choose a different version, and run the same queries on them.
 */
export function createVersionedViews(schema: PgSchema<string>) {
  return {
    observationSeriesBatch: schema
      .view('observation_series_batch', {
        version: integer('version').notNull(),
        trendValues: doublePrecision('trend_values').array(),
        indicatorId: uuid('indicator_id').notNull(),
      })
      .existing(),
    observationSeries: schema
      .view('observation_series', {
        indicatorId: uuid('indicator_id').notNull(),
        areaId: uuid('area_id').notNull(),
        dimensionKey: text('dimension_key').notNull(),
        sex: text('sex').notNull(),
        periodType: text('period_type').$type<SeriesPeriodType>().notNull(),
        variants: jsonb('variants').$type<ObservationSeriesVariant[]>().notNull(),
        latestObservationId: uuid('latest_observation_id').notNull(),
        rankingObservationId: uuid('ranking_observation_id'),
        recentObservationIds: uuid('recent_observation_ids').array().notNull(),
        sparklineObservationIds: uuid('sparkline_observation_ids').array(),
        recentValues: doublePrecision('recent_values').array().notNull(),
      })
      .existing(),
    indicator: schema
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
        updateFrequencyReason: text('update_frequency_reason'),
        updateFrequencyText: text('update_frequency_text'),
        updateFrequencyYears: smallint('update_frequency_years'),
        comparatorMethodId: uuid('comparator_method_id'),
        hasGoalBenchmark: boolean('has_goal_benchmark'),
        ciConfidenceLevel: text('ci_confidence_level', { enum: CI_CONFIDENCE_LEVELS }),
        definition: text('definition'),
        rationale: text('rationale'),
        methodology: text('methodology'),
        numeratorDefinition: text('numerator_definition'),
        numeratorDisclosureControlDetail: text('numerator_disclosure_control_detail'),
        denominatorDefinition: text('denominator_definition'),
        denominatorDisclosureControlDetail: text('denominator_disclosure_control_detail'),
        caveatsDetail: text('caveats_detail'),
        otherNotesDetail: text('other_notes_detail'),
        dataSourceId: uuid('data_source_id'),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
        // The view joins only indicators with a published version, and
        // `indicator_version_published_at_check` gives every published version a `published_at`.
        firstPublishedAt: timestamp('first_published_at', { withTimezone: true }).notNull(),
        lastPublishedAt: timestamp('last_published_at', { withTimezone: true }).notNull(),
        fingertipsFormatting: jsonb('fingertips_formatting').$type<FingertipsFormatting>(),
      })
      .as(sql`
SELECT
  i.id,
  i.short_id,
  i.data_updated_at,
  i.created_at,
  v.name,
  v.slug,
  v.value_type_id,
  v.unit_id,
  v.unit_detail,
  v.year_type,
  v.year_end_day,
  v.year_end_month,
  v.ci_method_id,
  v.polarity,
  v.update_frequency,
  v.update_frequency_reason,
  v.update_frequency_text,
  v.update_frequency_years,
  v.comparator_method_id,
  v.has_goal_benchmark,
  v.ci_confidence_level,
  v.definition,
  v.rationale,
  v.methodology,
  v.numerator_definition,
  v.numerator_disclosure_control_detail,
  v.denominator_definition,
  v.denominator_disclosure_control_detail,
  v.caveats_detail,
  v.other_notes_detail,
  v.data_source_id,
  v.updated_at,
  p.first_published_at,
  p.last_published_at,
  v.fingertips_formatting
FROM indicator i
JOIN current_published_version cpv ON cpv.indicator_id = i.id
JOIN indicator_version v ON v.id = cpv.id
CROSS JOIN LATERAL (
  SELECT min(pv.published_at) AS first_published_at, max(pv.published_at) AS last_published_at
  FROM indicator_version pv
  WHERE pv.indicator_id = i.id
) p
      `),
    /** The policy goals of each published indicator, in the order the publisher gave them. */
    indicatorGoal: schema
      .view('indicator_goal', {
        indicatorId: uuid('indicator_id').notNull(),
        position: smallint('position').notNull(),
        lowerComparison: text('lower_comparison', { enum: GOAL_LOWER_COMPARISONS }).notNull(),
        lowerValue: doublePrecision('lower_value').notNull(),
        upperComparison: text('upper_comparison', { enum: GOAL_UPPER_COMPARISONS }),
        upperValue: doublePrecision('upper_value'),
        polarity: text('polarity', { enum: GOAL_POLARITIES }).notNull(),
        policyDetail: text('policy_detail'),
      })
      .as(sql`
SELECT
  cpv.indicator_id,
  g.position,
  g.lower_comparison,
  g.lower_value,
  g.upper_comparison,
  g.upper_value,
  g.polarity,
  g.policy_detail
FROM current_published_version cpv
JOIN indicator_version_goal g ON g.indicator_version_id = cpv.id
      `),
    /**
     * The summaries of published updates, each with the time its version was published: every
     * update but one the core team published without visibility in history. Only a published
     * version whose latest submission has a core team decision is here, so a new indicator's first
     * version never is.
     */
    indicatorUpdateSummary: schema
      .view('indicator_update_summary', {
        indicatorId: uuid('indicator_id').notNull(),
        publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
        updateSummary: text('update_summary').notNull(),
      })
      .existing(),
    /** Every slug any published version carries, so an indicator's earlier addresses resolve. */
    indicatorSlug: schema
      .view('indicator_slug', {
        slug: text('slug').notNull(),
        indicatorId: uuid('indicator_id').notNull(),
      })
      .existing(),
    indicatorTopic: schema
      .view('indicator_topic', {
        indicatorId: uuid('indicator_id').notNull(),
        topicId: uuid('topic_id').notNull(),
      })
      .existing(),
    indicatorSubtopic: schema
      .view('indicator_subtopic', {
        indicatorId: uuid('indicator_id').notNull(),
        topicId: uuid('topic_id').notNull(),
        subtopicId: uuid('subtopic_id').notNull(),
      })
      .existing(),
    indicatorClassification: schema
      .view('indicator_classification', {
        indicatorId: uuid('indicator_id').notNull(),
        classificationId: uuid('classification_id').notNull(),
      })
      .existing(),
    /**
     * The providers and sources of each published indicator's numerator, denominator and data
     * values. A data value's sources name its position.
     */
    indicatorSource: schema
      .view('indicator_source', {
        indicatorId: uuid('indicator_id').notNull(),
        part: text('part', { enum: INDICATOR_SOURCE_PARTS }).notNull(),
        position: smallint('position').notNull(),
        providerId: uuid('provider_id').notNull(),
        sourceId: uuid('source_id'),
        dataValuePosition: smallint('data_value_position'),
      })
      .existing(),
    /** The data values of each published indicator without a numerator and denominator. */
    indicatorDataValue: schema
      .view('indicator_data_value', {
        indicatorId: uuid('indicator_id').notNull(),
        position: smallint('position').notNull(),
        definition: text('definition'),
        disclosureControlDetail: text('disclosure_control_detail'),
      })
      .existing(),
    observation: schema
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
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        dimensionKey: text('dimension_key').notNull(),
      })
      .existing(),
    observationDimension: schema
      .view('observation_dimension', {
        observationId: uuid('observation_id').notNull(),
        dimensionValueId: uuid('dimension_value_id').notNull(),
        dimensionTypeId: uuid('dimension_type_id').notNull(),
      })
      .existing(),
    observationNote: schema
      .view('observation_note', {
        observationId: uuid('observation_id').notNull(),
        noteTypeId: uuid('note_type_id').notNull(),
      })
      .existing(),
    availableData: schema
      .view('available_data', {
        indicatorId: uuid('indicator_id').notNull(),
        areaTypeId: uuid('area_type_id').notNull(),
        areaTypeName: text('area_type_name').notNull(),
        areaCount: integer('area_count').notNull(),
      })
      .existing(),
    observationRange: schema
      .view('observation_range', {
        indicatorId: uuid('indicator_id').notNull(),
        displayGroup: text('display_group').notNull(),
        fromDate: date('from_date').notNull(),
        toDate: date('to_date').notNull(),
        segment: text('segment').notNull(),
        min: doublePrecision('min').notNull(),
        max: doublePrecision('max').notNull(),
        p25: doublePrecision('p25'),
        p75: doublePrecision('p75'),
        quintileCutoffs: doublePrecision('quintile_cutoffs').array(),
      })
      .existing(),
  };
}

const publishedVersionedViews = createVersionedViews(publishedSchema);

export const {
  observationSeriesBatch: publishedObservationSeriesBatch,
  observationSeries: publishedObservationSeries,
  indicator: publishedIndicator,
  indicatorGoal: publishedIndicatorGoal,
  indicatorUpdateSummary: publishedIndicatorUpdateSummary,
  indicatorSlug: publishedIndicatorSlug,
  indicatorTopic: publishedIndicatorTopic,
  indicatorSubtopic: publishedIndicatorSubtopic,
  indicatorClassification: publishedIndicatorClassification,
  indicatorSource: publishedIndicatorSource,
  indicatorDataValue: publishedIndicatorDataValue,
  observation: publishedObservation,
  observationDimension: publishedObservationDimension,
  observationNote: publishedObservationNote,
  availableData: publishedAvailableData,
  observationRange: publishedObservationRange,
} = publishedVersionedViews;

export const publishedAreaCategory = publishedSchema
  .view('area_category', {
    areaId: uuid('area_id').notNull(),
    dimensionValueId: uuid('dimension_value_id').notNull(),
  })
  .existing();

/**
 * Every published view, keyed by its name. The repository functions read whichever set of views
 * they are given, so the same queries can run on another schema's views of the same shape.
 */
export const publishedViews = {
  area: publishedArea,
  areaCategory: publishedAreaCategory,
  areaNeighbour: publishedAreaNeighbour,
  areaRelationship: publishedAreaRelationship,
  areaType: publishedAreaType,
  ciMethod: publishedCiMethod,
  classification: publishedClassification,
  comparatorMethod: publishedComparatorMethod,
  dataProvider: publishedDataProvider,
  dataProviderSource: publishedDataProviderSource,
  dataSource: publishedDataSource,
  dimensionType: publishedDimensionType,
  dimensionValue: publishedDimensionValue,
  dimensionValueAgeRange: publishedDimensionValueAgeRange,
  noteType: publishedNoteType,
  subtopic: publishedSubtopic,
  topic: publishedTopic,
  unit: publishedUnit,
  valueType: publishedValueType,
  ...publishedVersionedViews,
};

export type ViewSet = typeof publishedViews;
