import { z } from '@fphd/config/zod';
import type { CatalogueEntry, Repositories } from '@fphd/db';
import { SLUG_PATTERN } from '@fphd/utils/slug';
import { SCHEMELESS_DIMENSIONS } from '@fphd/utils/standard-dimension';
import { Router } from 'express';

import {
  listItems,
  listParam,
  negotiate,
  notModified,
  parseQuery,
  sendProblem,
  sendTable,
} from './http.ts';
import { type Tag, toTag } from './tags.ts';

export const INDICATOR_COLUMNS = [
  'shortId',
  'slug',
  'name',
  'valueType',
  'unit',
  'polarity',
  'updateFrequency',
  'dataUpdatedAt',
] as const;

function tagsOf({ detail }: CatalogueEntry): Tag[] {
  return [
    ...detail.topics.flatMap(({ slug, title, subtopics = [] }) => [
      toTag({ kind: 'topic', slug, name: title }),
      ...subtopics.map((subtopic) =>
        toTag({ kind: 'subtopic', slug: subtopic.slug, name: subtopic.title, topicSlug: slug }),
      ),
    ]),
    ...detail.classifications.map(({ dimension, slug, name }) =>
      toTag({ kind: 'classification', slug, name, dimension }),
    ),
  ];
}

/** The dimensions an indicator's data uses, by public slug, with their schemes and values. */
function dimensionsOf({ dimensions }: CatalogueEntry) {
  const bySlug = new Map<string, { slug: string; schemes: Set<string>; values: Set<string> }>();
  for (const { standardDimension, typeSlug, valueSlug } of dimensions) {
    const slug = standardDimension ?? typeSlug;
    if (slug === null) continue;
    const entry = bySlug.get(slug) ?? { slug, schemes: new Set(), values: new Set() };
    bySlug.set(slug, entry);
    if (standardDimension !== null && !SCHEMELESS_DIMENSIONS.includes(standardDimension)) {
      if (typeSlug !== null) entry.schemes.add(typeSlug);
    }
    entry.values.add(valueSlug);
  }
  return [...bySlug.values()].map(({ slug, schemes, values }) => ({
    slug,
    schemes: [...schemes].sort(),
    values: [...values].sort(),
  }));
}

function summaryOf({ detail }: CatalogueEntry) {
  return {
    shortId: detail.shortId,
    slug: detail.slug,
    name: detail.name,
    valueType: detail.valueType,
    unit: detail.unit,
    polarity: detail.polarity,
    updateFrequency: detail.updateFrequency,
    dataUpdatedAt: detail.dataUpdatedAt,
  };
}

/** An indicator's metadata, as the spec's `IndicatorDetail` shapes it. */
export function toIndicatorDetail(entry: CatalogueEntry) {
  const { detail } = entry;
  return {
    ...summaryOf(entry),
    definition: detail.definition,
    rationale: detail.rationale,
    methodology: detail.methodology,
    numeratorDefinition: detail.numeratorDefinition,
    denominatorDefinition: detail.denominatorDefinition,
    caveats: detail.caveats,
    disclosureControl: detail.disclosureControl,
    dataSource: detail.dataSource,
    ciMethod: detail.ciMethod,
    comparatorMethod: detail.comparatorMethod,
    tags: tagsOf(entry),
    areaTypes: entry.levels,
    periods: entry.periods,
    dimensions: dimensionsOf(entry),
    notes: entry.notes,
  };
}

export function indicatorsRouter(
  indicators: Repositories['indicators'],
  reference: Repositories['reference'],
): Router {
  const router = Router();

  router.get('/v0/indicators', async (request, response) => {
    const query = parseQuery(request, response, {
      shortId: listParam(/^\d{1,9}$/, 'indicator short ids'),
      tag: listParam(SLUG_PATTERN, 'tag slugs'),
      areaType: z.string().regex(SLUG_PATTERN, 'must be an area type slug').optional(),
    });
    if (query === undefined) return;
    const format = negotiate(request, response, ['csv', 'json']);
    if (format === undefined) return;
    if (notModified(request, response, await reference.dataVersion(), format)) return;

    const shortIds = listItems(query.shortId)?.map(Number);
    const tags = listItems(query.tag) ?? [];
    const entries = (
      await indicators.listCatalogue(shortIds === undefined ? {} : { shortIds })
    ).filter((entry) => {
      const slugs = new Set(tagsOf(entry).map(({ slug }) => slug));
      return (
        tags.every((tag) => slugs.has(tag)) &&
        (query.areaType === undefined || entry.levels.some(({ slug }) => slug === query.areaType))
      );
    });

    // JSON gives each indicator's whole metadata; CSV, a summary row.
    sendTable(
      response,
      format,
      INDICATOR_COLUMNS,
      format === 'json' ? entries.map(toIndicatorDetail) : entries.map(summaryOf),
    );
  });

  router.get('/v0/indicators/:indicator', async (request, response) => {
    if (parseQuery(request, response, {}) === undefined) return;
    const format = negotiate(request, response, ['json']);
    if (format === undefined) return;
    if (notModified(request, response, await reference.dataVersion(), format)) return;

    const identifier = request.params.indicator;
    const id = /^\d{1,9}$/.test(identifier)
      ? await indicators.resolveId(Number(identifier))
      : SLUG_PATTERN.test(identifier.toLowerCase())
        ? await indicators.resolveIdBySlug(identifier.toLowerCase())
        : undefined;
    const [entry] = id === undefined ? [] : await indicators.listCatalogue({ ids: [id] });
    if (!entry) {
      sendProblem(response, 404, 'not_found', `No indicator has the identifier '${identifier}'.`);
      return;
    }
    response.json(toIndicatorDetail(entry));
  });

  return router;
}
