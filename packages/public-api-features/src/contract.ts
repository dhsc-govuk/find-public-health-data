import { z } from '@fphd/config/zod';
import { CI_CONFIDENCE_LEVELS } from '@fphd/utils/ci-confidence-level';
import { CONTROL_CHARACTER } from '@fphd/utils/control-character';
import { YEAR_TYPES } from '@fphd/utils/period-type';
import { POLARITIES } from '@fphd/utils/polarity';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@fphd/utils/slug';
import { tidyName } from '@fphd/utils/tidy-name';
import { UPDATE_FREQUENCIES } from '@fphd/utils/update-frequency';

// One selection contains up to 19 picked areas and England for comparison.
export const MAX_SELECTED_AREAS = 19;
export const MAX_AREA_CODES_PER_REQUEST = MAX_SELECTED_AREAS + 1;
export const MAX_RANKING_AREAS = 500;
export const MAX_AREA_GROUPS_PER_REQUEST = 20;
export const MAX_AREA_NAME_LENGTH = 100;
export const MAX_AREA_PREVIEW = 101;
export const DEFAULT_AREA_SEARCH_RESULTS = 50;
export const MAX_AREA_SEARCH_RESULTS = 100;
export const AREA_CODE_RE = /^[A-Z0-9]+$/i;
export const MAX_INDICATOR_QUERY_LENGTH = 200;
export const DEFAULT_INDICATOR_SEARCH_RESULTS = 20;
export const MAX_INDICATOR_SEARCH_RESULTS = 100;
export const MAX_INDICATOR_FILTER_RESULTS = 200;
export const MAX_TABLE_INDICATORS_PER_REQUEST = 20;
export const MAX_FILTER_LABEL_LENGTH = 500;
export const MAX_FILTER_VALUE_LENGTH = 100;
export const MAX_FILTER_VALUES = 100;

export const indicatorDataQuerySchema = z.object({
  observationHistory: z
    .enum(['recentPerSeries', 'latestPerSeries', 'lastEightPeriodsPerSeries'])
    .catch('recentPerSeries'),
});

export type ObservationHistory = z.infer<typeof indicatorDataQuerySchema>['observationHistory'];

export const indicatorPeriodFiltersSchema = z.object({
  fromYear: z
    .string()
    .regex(/^[12]\d{3}$/)
    .catch(''),
  toYear: z
    .string()
    .regex(/^[12]\d{3}$/)
    .catch(''),
  updatedWithin: z.enum(['', '3', '6', '12']).catch(''),
});

const CONTROL_CHARACTERS = new RegExp(CONTROL_CHARACTER, 'gu');

/**
 * A free-text query as the API searches it: each control character a space, each run of
 * whitespace one space, trimmed and cut to `max`. A query of control characters alone is empty.
 */
export function queryText(value: unknown, max: number): string {
  return typeof value === 'string'
    ? tidyName(value.replaceAll(CONTROL_CHARACTERS, ' ')).slice(0, max)
    : '';
}

/**
 * A `limit` query parameter as a whole number from 1 up to `max`. A larger number is cut to
 * `max`. A missing or malformed value returns undefined, so the caller picks the default.
 */
export function queryLimit(value: unknown, max: number): number | undefined {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value)
    ? Math.min(Number(value), max)
    : undefined;
}

export function pickAreaCodes(value: unknown, limit = MAX_AREA_CODES_PER_REQUEST): string[] {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [value]).filter(
        (code): code is string =>
          typeof code === 'string' &&
          code.length <= MAX_AREA_NAME_LENGTH &&
          AREA_CODE_RE.test(code),
      ),
    ),
  ].slice(0, limit);
}

/**
 * The wire contract for the public API, defined once and imported by both sides: the
 * routers build responses to these shapes, and the web app's loaders parse against them.
 *
 * This module deliberately imports nothing but zod — it is exposed on its own subpath so a
 * web app can depend on the contract without pulling Express or the database package into
 * its module graph.
 *
 * Timestamps cross the wire as ISO strings (Express serialises Date that way), so the
 * schemas describe what a client actually receives, not the server-side row type.
 */
export const topicSummarySchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const topicSummaryListSchema = z.array(topicSummarySchema);

export const topicContentSchema = z.object({
  overviewIntro: z.string().min(1),
  highlightedIndicatorIds: z.array(z.number().int().positive()).max(4),
  highlightIntro: z.string().min(1),
  highlightPoints: z.array(z.string().min(1)),
  moreInformation: z.object({
    intro: z.string().min(1),
    sections: z.array(
      z.object({
        heading: z.string().min(1),
        links: z.array(
          z.object({ label: z.string().min(1), url: z.url(), note: z.string().optional() }),
        ),
      }),
    ),
  }),
});

export const topicDetailSchema = topicSummarySchema.extend({
  content: topicContentSchema.nullable().optional(),
  subtopics: z.array(z.object({ slug: z.string().min(1), title: z.string().min(1) })).optional(),
});

export const topicTrendSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  better: z.number().int().nonnegative(),
  worse: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  increasing: z.number().int().nonnegative(),
  decreasing: z.number().int().nonnegative(),
  unavailable: z.number().int().nonnegative(),
});

/** The indicator's canonical slug: what a link to it is built from. */
export const indicatorSlugSchema = z.string().min(1).max(SLUG_MAX_LENGTH).regex(SLUG_PATTERN);

// No row id: the UUID is internal, and a caller addresses an indicator by its short id or slug.
export const indicatorSummarySchema = z.object({
  shortId: z.number().int(),
  slug: indicatorSlugSchema,
  name: z.string().min(1),
});

export const indicatorListResponseSchema = z.object({
  indicators: z.array(indicatorSummarySchema),
});

export const indicatorSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().nullable(),
});

export const indicatorProviderSourceSchema = z.object({
  provider: z.string().min(1),
  source: z.string().min(1).nullable(),
});

export const indicatorDetailSchema = z.object({
  shortId: z.number().int(),
  slug: indicatorSlugSchema,
  name: z.string().min(1),
  valueType: z.string().min(1),
  /** Null when the values have no unit, so none is shown beside them. */
  unit: z.string().min(1).nullable(),
  /** Null for an indicator of months, which have no year type. */
  yearType: z.object({ value: z.enum(YEAR_TYPES), label: z.string().min(1) }).nullable(),
  updateFrequency: z.enum(UPDATE_FREQUENCIES),
  /**
   * Why the indicator has no fixed frequency or will no longer be updated. Null beside any other
   * frequency, and beside those two for an indicator imported without one.
   */
  updateFrequencyReason: z.string().nullable(),
  polarity: z.enum(POLARITIES),
  ciMethod: z.string().nullable(),
  ciConfidenceLevel: z.enum(CI_CONFIDENCE_LEVELS).nullable(),
  comparatorMethod: z.string().nullable(),
  dataUpdatedAt: z.iso.datetime().nullable(),
  firstPublishedAt: z.iso.datetime(),
  lastPublishedAt: z.iso.datetime(),
  definition: z.string().nullable(),
  rationale: z.string().nullable(),
  methodology: z.string().nullable(),
  numeratorDefinition: z.string().nullable(),
  denominatorDefinition: z.string().nullable(),
  disclosureControl: z.string().nullable(),
  caveats: z.string().nullable(),
  notes: z.string().nullable(),
  dataSource: indicatorSourceSchema.nullable(),
  numeratorSources: z.array(indicatorProviderSourceSchema),
  denominatorSources: z.array(indicatorProviderSourceSchema),
  areaTypes: z.array(z.object({ name: z.string().min(1), areaCount: z.number().int() })),
  topics: z.array(
    z.object({
      slug: z.string().min(1),
      title: z.string().min(1),
      isPrimary: z.boolean().optional(),
      subtopics: z
        .array(
          z.object({ slug: z.string().min(1), title: z.string().min(1), isPrimary: z.boolean() }),
        )
        .optional(),
    }),
  ),
  classifications: z.array(
    z.object({
      dimension: z.string().min(1),
      slug: z.string().min(1),
      name: z.string().min(1),
    }),
  ),
  /** The summaries of the published updates visible in history, newest first. */
  updateSummaries: z.array(z.object({ publishedAt: z.iso.datetime(), summary: z.string().min(1) })),
});

export const indicatorObservationSchema = z.object({
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
  value: z.number().nullable(),
  lowerCi95: z.number().nullable(),
  upperCi95: z.number().nullable(),
  lowerCi998: z.number().nullable(),
  upperCi998: z.number().nullable(),
  count: z.number().nullable(),
  numerator: z.number().nullable(),
  denominator: z.number().nullable(),
  notes: z.array(z.object({ text: z.string().min(1), category: z.string().min(1) })),
  dimensions: z.array(
    z.object({
      type: z.string().min(1),
      value: z.string().min(1),
      dimensionClass: z.string().min(1),
      sortOrder: z.number().int(),
    }),
  ),
});

export const indicatorAreaDataSchema = z.object({
  areaCode: z.string().min(1),
  areaName: z.string().min(1),
  observations: z.array(indicatorObservationSchema),
  populationKeys: z.array(z.string()).optional(),
});

export const indicatorAreaDataListSchema = z.array(indicatorAreaDataSchema);
export const indicatorTableDataSchema = z.array(
  z.object({
    detail: indicatorDetailSchema,
    areaData: indicatorAreaDataListSchema,
    tableSeries: z
      .array(
        z.object({
          sex: z.string(),
          periodType: z.enum(['all', '1-year', '3-year']),
          segments: z.record(z.string(), z.string()),
          trends: z.record(z.string(), z.enum(['up', 'down', 'right']).nullable()).optional(),
          rowOrder: z.record(z.string(), z.number().int().nonnegative()).optional(),
        }),
      )
      .optional(),
  }),
);

export const indicatorRangeSchema = z.object({
  periods: z.array(
    z.object({
      fromDate: z.string().min(1),
      toDate: z.string().min(1),
      /** Dimension values joined by '|' in dimension-type order; '' when aggregate. */
      segment: z.string(),
      min: z.number(),
      max: z.number(),
      p25: z.number().nullish(),
      p75: z.number().nullish(),
      quintileCutoffs: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullish(),
    }),
  ),
});

export const areaSummarySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

export const areaListSchema = z.array(areaSummarySchema);

export const areaGroupListSchema = z.array(
  z.object({ areaType: z.string().min(1), areas: areaListSchema }),
);

export const areaLookupListSchema = z.array(
  z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    areaType: z.string().min(1),
    displayGroup: z.string().min(1).nullable(),
  }),
);

export const displayGroupListSchema = z.array(z.string().min(1));

export const areaDisplayGroupListSchema = z.array(
  z.object({ displayGroup: z.string().min(1), areas: areaListSchema }),
);

export const areaParentListSchema = z.array(
  z.object({
    code: z.string().min(1),
    parentCode: z.string().min(1),
    parentName: z.string().min(1),
  }),
);

export type TopicSummary = z.infer<typeof topicSummarySchema>;
export type TopicDetail = z.infer<typeof topicDetailSchema>;
export type TopicTrendSummary = z.infer<typeof topicTrendSummarySchema>;
export type IndicatorSummary = z.infer<typeof indicatorSummarySchema>;
export type IndicatorDetail = z.infer<typeof indicatorDetailSchema>;
export type IndicatorSource = z.infer<typeof indicatorSourceSchema>;
export type IndicatorProviderSource = z.infer<typeof indicatorProviderSourceSchema>;
export type IndicatorObservation = z.infer<typeof indicatorObservationSchema>;
export type IndicatorAreaData = z.infer<typeof indicatorAreaDataSchema>;
export type IndicatorRange = z.infer<typeof indicatorRangeSchema>;
export type IndicatorRangePeriod = IndicatorRange['periods'][number];
export type AreaSummary = z.infer<typeof areaSummarySchema>;
export type AreaGroup = z.infer<typeof areaGroupListSchema>[number];
export type AreaLookup = z.infer<typeof areaLookupListSchema>[number];
export type AreaParent = z.infer<typeof areaParentListSchema>[number];

export const indicatorSearchRowSchema = z.object({
  shortId: z.number().int(),
  slug: indicatorSlugSchema,
  name: z.string().min(1),
  topics: z.array(z.object({ slug: z.string().min(1), title: z.string().min(1) })),
  classifications: z.array(
    z.object({ dimension: z.string().min(1), slug: z.string().min(1), name: z.string().min(1) }),
  ),
});

export const indicatorSearchResultSchema = z.object({
  total: z.number().int(),
  // The cap the server applied, so the page can say how many of the total it is showing.
  limit: z.number().int(),
  indicators: z.array(indicatorSearchRowSchema),
  page: z.number().int().positive().optional(),
});

export const indicatorFacetsSchema = z.object({
  topics: z.array(z.object({ slug: z.string().min(1), title: z.string().min(1) })),
  classifications: z.array(
    z.object({ dimension: z.string().min(1), slug: z.string().min(1), name: z.string().min(1) }),
  ),
  sources: z.array(z.string().min(1)),
  valueTypes: z.array(z.string().min(1)),
  yearTypes: z.array(z.string().min(1)),
});

export type IndicatorSearchRow = z.infer<typeof indicatorSearchRowSchema>;
export type IndicatorSearchResult = z.infer<typeof indicatorSearchResultSchema>;
export type IndicatorFacets = z.infer<typeof indicatorFacetsSchema>;

export const indicatorScatterSchema = z.object({
  points: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      period: z.string(),
      fromDate: z.iso.date(),
      toDate: z.iso.date(),
      x: z.number(),
      y: z.number(),
    }),
  ),
});
