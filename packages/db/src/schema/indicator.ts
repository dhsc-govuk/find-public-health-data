import { INDICATOR_CALCULATED_BY, type IndicatorCalculatedBy } from '@fphd/utils/calculated-by';
import { CI_CONFIDENCE_LEVELS } from '@fphd/utils/ci-confidence-level';
import {
  INDICATOR_DISCLOSURE_CONTROL,
  type IndicatorDisclosureControl,
} from '@fphd/utils/disclosure-control';
import {
  PERIOD_TYPES,
  PERIOD_TYPES_WITH_YEAR_TYPE,
  YEAR_TYPES,
  type YearType,
} from '@fphd/utils/period-type';
import { GOAL_POLARITIES, POLARITIES } from '@fphd/utils/polarity';
import {
  AGE_TYPES,
  AGE_UNIT_DAYS,
  AGE_UNITS,
  type AgeType,
  MAX_AGE,
  SEXES,
} from '@fphd/utils/sex-and-ages';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@fphd/utils/slug';
import { INDICATOR_SOURCE_PARTS } from '@fphd/utils/source-part';
import { UPDATE_FREQUENCIES } from '@fphd/utils/update-frequency';
import {
  INDIRECTLY_STANDARDISED_VALUE_TYPE_IDS,
  STANDARD_POPULATIONS,
  type StandardPopulation,
  UNIT_IDS,
  VALUE_TYPE_IDS,
} from '@fphd/utils/value-type-and-unit';
import { type AnyColumn, asc, desc, eq, type SQL, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgSequence,
  pgTable,
  pgView,
  primaryKey,
  QueryBuilder,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { literals, uuidPrimaryKey } from './helpers.ts';
import {
  ciMethod,
  comparatorMethod,
  dataProvider,
  dataProviderSource,
  dataSource,
  unit,
  valueType,
} from './lookup.ts';
import { team } from './team.ts';
import { uploadBatch } from './upload.ts';
import { audit } from './user.ts';

export const INDICATOR_VERSION_STATUSES = ['draft', 'scheduled', 'published'] as const;

export type IndicatorVersionStatus = (typeof INDICATOR_VERSION_STATUSES)[number];

/**
 * The statuses of the version a publisher works on, until it is published: an indicator has at
 * most one. A scheduled version is a draft an admin has confirmed the publication date of.
 */
export const UNPUBLISHED_VERSION_STATUSES = [
  'draft',
  'scheduled',
] as const satisfies readonly IndicatorVersionStatus[];

/**
 * The unpublished statuses as SQL literals, for raw SQL: postgres.js nests them with `unsafe`,
 * so a statement's predicate matches the one-unpublished index's under any plan.
 */
export const UNPUBLISHED_STATUS_LITERALS = UNPUBLISHED_VERSION_STATUSES.map(
  (status) => `'${status}'`,
).join(', ');

/**
 * Whether `status` names an unpublished version. The statuses are literals, as the one-unpublished
 * index's predicate has them, so the planner can use it.
 */
export function isUnpublished(status: AnyColumn): SQL {
  return sql`${status} IN (${literals(UNPUBLISHED_VERSION_STATUSES)})`;
}

/**
 * SQL that is true when `status` is 'scheduled'. It writes 'scheduled' as a literal rather than
 * as a query parameter, so the planner can use the partial index of scheduled versions,
 * `idx_indicator_version_scheduled_publish_at`, whose condition is built by this function too.
 */
export function isScheduled(status: AnyColumn): SQL {
  return sql`${status} = ${literals(['scheduled'])}`;
}

/** A yes whose detail the contract requires: the detail is kept beside a yes and nothing else. */
function detailBesideYes(answer: AnyPgColumn, detail: AnyPgColumn): SQL {
  return sql`(${answer} IS TRUE) = (${detail} IS NOT NULL)`;
}

/** A choice whose detail the contract requires, kept beside that choice and nothing else. */
function detailBesideChoice(column: AnyPgColumn, choice: string, detail: AnyPgColumn): SQL {
  return sql`(${column} IS NOT DISTINCT FROM ${literals([choice])}) = (${detail} IS NOT NULL)`;
}

/** An age in days, as the contract compares ages; null when either part is. */
function ageInDays(age: AnyPgColumn, unit: AnyPgColumn): SQL {
  const days = Object.entries(AGE_UNIT_DAYS).map(
    ([name, length]) => `WHEN '${name}' THEN ${length}`,
  );
  return sql`${age} * CASE ${unit} ${sql.raw(days.join(' '))} END`;
}

// Starts above every Fingertips number carried over in the seed, so this service's own
// numbering is visible at a glance.
export const indicatorShortIdSeq = pgSequence('indicator_short_id_seq', { startWith: 100000 });

/** The indicator's identity: nothing here is editable, so nothing here is versioned. */
export const indicator = pgTable('indicator', {
  id: uuidPrimaryKey(),
  // The public indicator number, carried over from Fingertips where there was one and
  // minted here otherwise; it appears in published URLs, so it never changes.
  shortId: integer()
    .notNull()
    .unique('indicator_short_id_unique')
    .default(sql`nextval('indicator_short_id_seq')`),
  // When the source system last published data for this indicator. It describes the data,
  // not the editorial content, so it stays off the version.
  dataUpdatedAt: timestamp({ withTimezone: true }),
  // The team whose publishers own it.
  teamId: uuid()
    .notNull()
    .references(() => team.id),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * Everything a publisher edits, one row per draft or publication. Attribute columns are
 * nullable so a draft can be incomplete; completeness is checked when a draft is
 * submitted, not by the table.
 */
export const indicatorVersion = pgTable(
  'indicator_version',
  {
    id: uuidPrimaryKey(),
    indicatorId: uuid()
      .notNull()
      .references(() => indicator.id),
    status: text({ enum: INDICATOR_VERSION_STATUSES }).notNull().default('draft'),
    // Set by a workflow step whose submission status stops the publisher editing the draft,
    // and cleared by one that frees it; nothing else writes it.
    isLocked: boolean().notNull().default(false),
    publishedAt: timestamp({ withTimezone: true }),
    // When the publisher asks for this version to be published; published_at records when it was.
    scheduledPublishAt: timestamp({ withTimezone: true }),
    // The batch holding this version's data, which later versions share until a new upload.
    uploadBatchId: uuid(),
    // When the publisher confirmed the data table; an upload clears it.
    dataTableConfirmedAt: timestamp({ withTimezone: true }),
    // A draft is only ever created from the page that asks for a name.
    name: text().notNull(),
    // Derived from the name by slugify, and the indicator's public address. An exclusion
    // constraint, which drizzle cannot express, keeps a slug to one indicator for ever.
    slug: text().notNull(),
    // Value type and units
    valueTypeId: uuid().references(() => valueType.id),
    // Asked of a directly standardised rate only, and the detail of an other population or of
    // the population an indirectly standardised value type is standardised against.
    standardPopulation: text({ enum: STANDARD_POPULATIONS }),
    standardPopulationDetail: text(),
    unitId: uuid().references(() => unit.id),
    // The unit a publisher names under "Other".
    unitDetail: text(),
    // Sex and ages
    sexes: text({ enum: SEXES }).array(),
    // The ranges an age type of range gives are rows of indicator_version_age_range.
    ageType: text({ enum: AGE_TYPES }),
    specificAge: smallint(),
    specificAgeUnit: text({ enum: AGE_UNITS }),
    ageDetail: text(),
    // Period type
    periodType: text({ enum: PERIOD_TYPES }),
    // Asked of years and quarters only, and the end date only of a year ending on a specified one.
    yearType: text({ enum: YEAR_TYPES }),
    yearEndDay: smallint(),
    yearEndMonth: smallint(),
    // Polarity
    polarity: text({ enum: POLARITIES }),
    // Data quality
    hasDataQualityIssues: boolean(),
    // Definition and rationale
    definition: text(),
    rationale: text(),
    // Numerator and denominator
    numeratorDefinition: text(),
    denominatorDefinition: text(),
    dataSourceId: uuid().references(() => dataSource.id),
    // How the indicator was calculated
    methodology: text(),
    calculatedBy: text({ enum: INDICATOR_CALCULATED_BY }),
    calculatedByDetail: text(),
    // Confidence intervals
    ciMethodId: uuid().references(() => ciMethod.id),
    // Asked of a standard CI method only, and the modifications only when there were some.
    hasCiMethodModifications: boolean(),
    ciMethodModificationsDetail: text(),
    // Asked of an other CI method only.
    ciMethodDetail: text(),
    ciConfidenceLevel: text({ enum: CI_CONFIDENCE_LEVELS }),
    // Benchmarking
    comparatorMethodId: uuid().references(() => comparatorMethod.id),
    // A goal is kept beside a yes alone; a single goal value has no upper value.
    hasGoalBenchmark: boolean(),
    goalLowerValue: doublePrecision(),
    goalUpperValue: doublePrecision(),
    goalPolarity: text({ enum: GOAL_POLARITIES }),
    goalPolicyDetail: text(),
    // Other notes and caveats
    // Each answer's detail is asked for, and required, only when the answer is yes.
    disclosureControl: text({ enum: INDICATOR_DISCLOSURE_CONTROL }),
    disclosureControlDetail: text(),
    hasRounding: boolean(),
    roundingDetail: text(),
    hasCaveats: boolean(),
    caveatsDetail: text(),
    hasOtherNotes: boolean(),
    otherNotesDetail: text(),
    // Links and tagging
    // The answered state of lists held in child tables, which a check cannot compare with the
    // rows, so the API keeps them in step: null until asked, false for an answered no.
    hasLinks: boolean(),
    hasRiskFactor: boolean(),
    hasFramework: boolean(),
    hasLifeStage: boolean(),
    isAreaContext: boolean().notNull().default(false),
    // Copyright and data re-use
    // True when the indicator states its own copyright or re-use terms instead of the defaults.
    hasCustomCopyright: boolean(),
    customCopyrightDetail: text(),
    hasCustomDataReuse: boolean(),
    customDataReuseDetail: text(),
    // Update frequency
    updateFrequency: text({ enum: UPDATE_FREQUENCIES }),
    // Notes for reviewers, never published.
    // Variance and quality
    variation: text(),
    qualityAssurance: text(),
    hasSourceDataIssues: boolean(),
    sourceDataIssuesDetail: text(),
    // Justifications
    ciMethodJustification: text(),
    dataSourcesJustification: text(),
    inequalitiesIncluded: text(),
    hasExclusions: boolean(),
    exclusionsDetail: text(),
    hasAutomation: boolean(),
    automationDetail: text(),
    // Other comments
    sponsorsAndStakeholders: text(),
    hasReviewerComments: boolean(),
    reviewerCommentsDetail: text(),
    // The writer of a version is always known: a publisher, or the system user of an import.
    ...audit,
  },
  (t) => [
    check(
      'indicator_version_ci_confidence_level_check',
      sql`${t.ciConfidenceLevel} IN (${literals(CI_CONFIDENCE_LEVELS)})`,
    ),
    check(
      'indicator_version_status_check',
      sql`${t.status} IN (${literals(INDICATOR_VERSION_STATUSES)})`,
    ),
    check('indicator_version_polarity_check', sql`${t.polarity} IN (${literals(POLARITIES)})`),
    check(
      'indicator_version_update_frequency_check',
      sql`${t.updateFrequency} IN (${literals(UPDATE_FREQUENCIES)})`,
    ),
    check(
      'indicator_version_standard_population_check',
      sql`${t.standardPopulation} IN (${literals(STANDARD_POPULATIONS)})`,
    ),
    check(
      'indicator_version_standard_population_value_type_check',
      sql`${t.standardPopulation} IS NULL OR ${t.valueTypeId} = ${literals([VALUE_TYPE_IDS.directlyStandardisedRate])}`,
    ),
    // Beside an other standard population, or an indirectly standardised value type, alone.
    check(
      'indicator_version_standard_population_detail_check',
      sql`${t.standardPopulationDetail} IS NULL OR ${t.standardPopulation} IS NOT DISTINCT FROM ${literals(['other' satisfies StandardPopulation])} OR ${t.valueTypeId} IN (${literals(INDIRECTLY_STANDARDISED_VALUE_TYPE_IDS)})`,
    ),
    check(
      'indicator_version_standard_population_other_check',
      sql`${t.standardPopulation} IS DISTINCT FROM ${literals(['other' satisfies StandardPopulation])} OR ${t.standardPopulationDetail} IS NOT NULL`,
    ),
    check(
      'indicator_version_unit_detail_check',
      sql`(${t.unitDetail} IS NOT NULL) = (${t.unitId} IS NOT DISTINCT FROM ${literals([UNIT_IDS.other])})`,
    ),
    check(
      'indicator_version_ci_method_modifications_detail_check',
      detailBesideYes(t.hasCiMethodModifications, t.ciMethodModificationsDetail),
    ),
    check(
      'indicator_version_calculated_by_check',
      sql`${t.calculatedBy} IN (${literals(INDICATOR_CALCULATED_BY)})`,
    ),
    check(
      'indicator_version_calculated_by_detail_check',
      detailBesideChoice(
        t.calculatedBy,
        'other' satisfies IndicatorCalculatedBy,
        t.calculatedByDetail,
      ),
    ),
    check(
      'indicator_version_disclosure_control_check',
      sql`${t.disclosureControl} IN (${literals(INDICATOR_DISCLOSURE_CONTROL)})`,
    ),
    check(
      'indicator_version_disclosure_control_detail_check',
      detailBesideChoice(
        t.disclosureControl,
        'yes' satisfies IndicatorDisclosureControl,
        t.disclosureControlDetail,
      ),
    ),
    check(
      'indicator_version_rounding_detail_check',
      detailBesideYes(t.hasRounding, t.roundingDetail),
    ),
    check('indicator_version_caveats_detail_check', detailBesideYes(t.hasCaveats, t.caveatsDetail)),
    check(
      'indicator_version_other_notes_detail_check',
      detailBesideYes(t.hasOtherNotes, t.otherNotesDetail),
    ),
    check(
      'indicator_version_custom_copyright_detail_check',
      detailBesideYes(t.hasCustomCopyright, t.customCopyrightDetail),
    ),
    check(
      'indicator_version_custom_data_reuse_detail_check',
      detailBesideYes(t.hasCustomDataReuse, t.customDataReuseDetail),
    ),
    check(
      'indicator_version_goal_polarity_check',
      sql`${t.goalPolarity} IN (${literals(GOAL_POLARITIES)})`,
    ),
    // A yes has its goal, which is a lower value and a polarity; nothing else has one.
    check(
      'indicator_version_goal_check',
      sql`(${t.hasGoalBenchmark} IS TRUE) = (${t.goalLowerValue} IS NOT NULL)`,
    ),
    check(
      'indicator_version_goal_pair_check',
      sql`(${t.goalLowerValue} IS NULL) = (${t.goalPolarity} IS NULL)`,
    ),
    check(
      'indicator_version_goal_upper_value_check',
      sql`${t.goalUpperValue} IS NULL OR (${t.goalLowerValue} IS NOT NULL AND ${t.goalUpperValue} > ${t.goalLowerValue})`,
    ),
    // The policy detail is optional beside a yes.
    check(
      'indicator_version_goal_policy_detail_check',
      sql`${t.hasGoalBenchmark} IS TRUE OR ${t.goalPolicyDetail} IS NULL`,
    ),
    // Postgres orders NaN above Infinity, so these bounds refuse it too.
    check(
      'indicator_version_goal_values_check',
      sql`${t.goalLowerValue} > '-Infinity' AND ${t.goalLowerValue} < 'Infinity' AND ${t.goalUpperValue} < 'Infinity'`,
    ),
    check(
      'indicator_version_source_data_issues_detail_check',
      detailBesideYes(t.hasSourceDataIssues, t.sourceDataIssuesDetail),
    ),
    check(
      'indicator_version_exclusions_detail_check',
      detailBesideYes(t.hasExclusions, t.exclusionsDetail),
    ),
    check(
      'indicator_version_automation_detail_check',
      detailBesideYes(t.hasAutomation, t.automationDetail),
    ),
    check(
      'indicator_version_reviewer_comments_detail_check',
      detailBesideYes(t.hasReviewerComments, t.reviewerCommentsDetail),
    ),
    check(
      'indicator_version_sexes_check',
      sql`${t.sexes} <@ ARRAY[${literals(SEXES)}]::text[] AND cardinality(${t.sexes}) > 0`,
    ),
    check('indicator_version_age_type_check', sql`${t.ageType} IN (${literals(AGE_TYPES)})`),
    check(
      'indicator_version_specific_age_unit_check',
      sql`${t.specificAgeUnit} IN (${literals(AGE_UNITS)})`,
    ),
    check(
      'indicator_version_specific_age_check',
      sql`${t.specificAge} BETWEEN 0 AND ${sql.raw(String(MAX_AGE))}`,
    ),
    // A specific age has its unit, and is kept beside that age type, which requires it, alone.
    check(
      'indicator_version_specific_age_pair_check',
      sql`(${t.specificAge} IS NULL) = (${t.specificAgeUnit} IS NULL)`,
    ),
    check(
      'indicator_version_specific_age_type_check',
      detailBesideChoice(t.ageType, 'specific' satisfies AgeType, t.specificAge),
    ),
    check(
      'indicator_version_age_detail_check',
      detailBesideChoice(t.ageType, 'other' satisfies AgeType, t.ageDetail),
    ),
    check(
      'indicator_version_period_type_check',
      sql`${t.periodType} IN (${literals(PERIOD_TYPES)})`,
    ),
    check('indicator_version_year_type_check', sql`${t.yearType} IN (${literals(YEAR_TYPES)})`),
    check(
      'indicator_version_year_type_period_check',
      sql`(${t.yearType} IS NOT NULL) = (${t.periodType} IS NOT NULL AND ${t.periodType} IN (${literals(PERIOD_TYPES_WITH_YEAR_TYPE)}))`,
    ),
    check(
      'indicator_version_year_end_check',
      sql`(${t.yearEndDay} IS NOT NULL) = (${t.yearType} IS NOT DISTINCT FROM ${literals(['specified-end-date' satisfies YearType])}) AND (${t.yearEndMonth} IS NOT NULL) = (${t.yearEndDay} IS NOT NULL)`,
    ),
    // A day of that month in some year, so 29 February is one.
    check(
      'indicator_version_year_end_date_check',
      sql`${t.yearEndMonth} BETWEEN 1 AND 12 AND ${t.yearEndDay} BETWEEN 1 AND CASE WHEN ${t.yearEndMonth} = 2 THEN 29 WHEN ${t.yearEndMonth} IN (4, 6, 9, 11) THEN 30 ELSE 31 END`,
    ),
    check(
      'indicator_version_data_table_confirmed_check',
      sql`${t.dataTableConfirmedAt} IS NULL OR ${t.uploadBatchId} IS NOT NULL`,
    ),
    // Target for upload_batch's composite (version, indicator) foreign key.
    unique('indicator_version_id_indicator_id_unique').on(t.id, t.indicatorId),
    // Pairing the batch with indicator_id keeps a version on a batch of its own indicator.
    foreignKey({
      name: 'indicator_version_upload_batch_fk',
      columns: [t.uploadBatchId, t.indicatorId],
      foreignColumns: [uploadBatch.id, uploadBatch.indicatorId],
    }),
    // A published version always says when, and nothing else does, so ordering by
    // published_at never meets a null.
    check(
      'indicator_version_published_at_check',
      sql`(${t.status} = ${literals(['published' satisfies IndicatorVersionStatus])}) = (${t.publishedAt} IS NOT NULL)`,
    ),
    // The shape slugify yields and a short id cannot take; reserved words are checked by the app.
    check(
      'indicator_version_slug_check',
      sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN.source}'`)} AND ${t.slug} !~ '^[0-9]+$' AND length(${t.slug}) <= ${sql.raw(String(SLUG_MAX_LENGTH))}`,
    ),
    // One unpublished version per indicator, as a constraint rather than a convention. An
    // indicator may hold several published versions; reads take the most recently published one.
    uniqueIndex('idx_indicator_version_one_unpublished')
      .on(t.indicatorId)
      .where(sql`${t.status} IN (${literals(UNPUBLISHED_VERSION_STATUSES)})`),
    // Scheduled publication finds due versions through this index. It holds only scheduled
    // versions, ordered by publication time and then id, which is the order they are published.
    index('idx_indicator_version_scheduled_publish_at')
      .on(t.scheduledPublishAt, t.id)
      .where(isScheduled(t.status)),
    index('idx_indicator_version_indicator').on(t.indicatorId),
    index('idx_indicator_version_slug').on(t.slug),
    index('idx_indicator_version_name_trgm').using('gin', t.name.op('gin_trgm_ops')),
  ],
);

/** The links a version offers users, in the order the publisher added them. */
export const indicatorVersionLink = pgTable(
  'indicator_version_link',
  {
    indicatorVersionId: uuid().notNull(),
    position: smallint().notNull(),
    url: text().notNull(),
    text: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.indicatorVersionId, t.position] }),
    foreignKey({
      name: 'indicator_version_link_version_fk',
      columns: [t.indicatorVersionId],
      foreignColumns: [indicatorVersion.id],
    }),
    check('indicator_version_link_position_check', sql`${t.position} >= 0`),
  ],
);

/** The age ranges a version covers, in the order the publisher gave them. */
export const indicatorVersionAgeRange = pgTable(
  'indicator_version_age_range',
  {
    indicatorVersionId: uuid().notNull(),
    position: smallint().notNull(),
    lowerLimit: smallint(),
    lowerLimitUnit: text({ enum: AGE_UNITS }),
    upperLimit: smallint(),
    upperLimitUnit: text({ enum: AGE_UNITS }),
  },
  (t) => [
    primaryKey({ columns: [t.indicatorVersionId, t.position] }),
    foreignKey({
      name: 'indicator_version_age_range_version_fk',
      columns: [t.indicatorVersionId],
      foreignColumns: [indicatorVersion.id],
    }),
    check('indicator_version_age_range_position_check', sql`${t.position} >= 0`),
    check(
      'indicator_version_age_range_lower_limit_unit_check',
      sql`${t.lowerLimitUnit} IN (${literals(AGE_UNITS)})`,
    ),
    check(
      'indicator_version_age_range_upper_limit_unit_check',
      sql`${t.upperLimitUnit} IN (${literals(AGE_UNITS)})`,
    ),
    check(
      'indicator_version_age_range_limits_check',
      sql`${t.lowerLimit} BETWEEN 0 AND ${sql.raw(String(MAX_AGE))} AND ${t.upperLimit} BETWEEN 0 AND ${sql.raw(String(MAX_AGE))}`,
    ),
    // Each limit has its unit, and a range has at least one limit.
    check(
      'indicator_version_age_range_lower_limit_pair_check',
      sql`(${t.lowerLimit} IS NULL) = (${t.lowerLimitUnit} IS NULL)`,
    ),
    check(
      'indicator_version_age_range_upper_limit_pair_check',
      sql`(${t.upperLimit} IS NULL) = (${t.upperLimitUnit} IS NULL)`,
    ),
    check(
      'indicator_version_age_range_limit_check',
      sql`${t.lowerLimit} IS NOT NULL OR ${t.upperLimit} IS NOT NULL`,
    ),
    check(
      'indicator_version_age_range_order_check',
      sql`${ageInDays(t.upperLimit, t.upperLimitUnit)} >= ${ageInDays(t.lowerLimit, t.lowerLimitUnit)}`,
    ),
  ],
);

/**
 * The providers, and where named their sources, of a version's numerator and denominator, in
 * the order the publisher added them. A null source is the provider with no specific source.
 */
export const indicatorVersionSource = pgTable(
  'indicator_version_source',
  {
    indicatorVersionId: uuid().notNull(),
    part: text({ enum: INDICATOR_SOURCE_PARTS }).notNull(),
    position: smallint().notNull(),
    providerId: uuid().notNull(),
    sourceId: uuid(),
  },
  (t) => [
    primaryKey({ columns: [t.indicatorVersionId, t.part, t.position] }),
    foreignKey({
      name: 'indicator_version_source_version_fk',
      columns: [t.indicatorVersionId],
      foreignColumns: [indicatorVersion.id],
    }),
    foreignKey({
      name: 'indicator_version_source_provider_fk',
      columns: [t.providerId],
      foreignColumns: [dataProvider.id],
    }),
    check(
      'indicator_version_source_part_check',
      sql`${t.part} IN (${literals(INDICATOR_SOURCE_PARTS)})`,
    ),
    check('indicator_version_source_position_check', sql`${t.position} >= 0`),
    // A named source belongs to the provider beside it.
    foreignKey({
      name: 'indicator_version_source_source_fk',
      columns: [t.sourceId, t.providerId],
      foreignColumns: [dataProviderSource.id, dataProviderSource.providerId],
    }),
    unique('indicator_version_source_pair_unique')
      .on(t.indicatorVersionId, t.part, t.providerId, t.sourceId)
      .nullsNotDistinct(),
  ],
);

/**
 * The one definition of "the published version": an indicator may hold several, and this
 * is the most recently published one, ties broken by id (UUIDv7, so creation order). The
 * `published` views and the internal reads join this rather than restating the rule, then
 * join `indicator_version` by `id` for the columns. It names the version and nothing else,
 * so a new version column never changes its definition or the views built on it.
 * Postgres pushes an `indicator_id` predicate into the DISTINCT ON, so a lookup by
 * indicator costs the same as it would against the table.
 *
 * Built on a QueryBuilder of its own: the one `.as()` would hand a callback carries no
 * casing, and drizzle-kit would then render the select list under the TypeScript names.
 */
export const currentPublishedVersion = pgView('current_published_version').as(
  new QueryBuilder({ casing: 'snake_case' })
    .selectDistinctOn([indicatorVersion.indicatorId], {
      id: indicatorVersion.id,
      indicatorId: indicatorVersion.indicatorId,
    })
    .from(indicatorVersion)
    .where(eq(indicatorVersion.status, 'published'))
    .orderBy(
      asc(indicatorVersion.indicatorId),
      desc(indicatorVersion.publishedAt),
      desc(indicatorVersion.id),
    ),
);
