import type { PublicDimensionTypeRow, PublicDimensionValueRow, Repositories } from '@fphd/db';
import { SLUG_PATTERN } from '@fphd/utils/slug';
import {
  isoDuration,
  SCHEMELESS_DIMENSIONS,
  STANDARD_DIMENSION_LABELS,
  STANDARD_DIMENSIONS,
} from '@fphd/utils/standard-dimension';
import { Router } from 'express';

import { negotiate, notModified, parseQuery, sendProblem, sendTable } from './http.ts';

export interface DimensionValue {
  slug: string;
  name: string;
  ageFrom?: string;
  ageUnder?: string | null;
}

export interface Scheme {
  slug: string;
  name: string;
  structure: {
    release: string;
    ranked: string;
    within: string;
    boundaries: string | null;
    groups: number[];
  } | null;
  values: DimensionValue[];
}

export interface Dimension {
  slug: string;
  name: string;
  standard: boolean;
  hasSchemes: boolean;
}

export interface DimensionDetail extends Dimension {
  schemes: Scheme[];
  values: DimensionValue[];
}

export const DIMENSION_COLUMNS = ['slug', 'name', 'standard', 'hasSchemes'] as const;

/** A type's name without the `[id]` the export adds to tell duplicate names apart. */
function displayName(name: string): string {
  return name.replace(/\s*\[\d+\]$/, '');
}

function toValue(row: PublicDimensionValueRow): DimensionValue {
  if (row.ageFromValue === null || row.ageFromUnit === null)
    return { slug: row.slug, name: row.name };
  return {
    slug: row.slug,
    name: row.name,
    ageFrom: isoDuration(row.ageFromValue, row.ageFromUnit),
    ageUnder:
      row.ageUnderValue === null || row.ageUnderUnit === null
        ? null
        : isoDuration(row.ageUnderValue, row.ageUnderUnit),
  };
}

/** Adds values a list doesn't have yet, by slug, keeping the first one's name. */
function mergeValues(into: DimensionValue[], values: readonly DimensionValue[]): void {
  const slugs = new Set(into.map(({ slug }) => slug));
  for (const value of values) {
    if (!slugs.has(value.slug)) {
      into.push(value);
      slugs.add(value.slug);
    }
  }
}

/**
 * The dimensions as the public API shows them, keyed by slug. A standard dimension gathers the
 * types that belong to it, as schemes or, for sex and age, as values. Each custom type is a
 * dimension of its own. A decile and a quintile version of one deprivation ranking share a
 * scheme, which lists both numbers of groups.
 */
export function toDimensions(
  types: readonly PublicDimensionTypeRow[],
  values: readonly PublicDimensionValueRow[],
): Map<string, DimensionDetail> {
  const valuesByType = Map.groupBy(values, (value) => value.dimensionTypeId);
  const dimensions = new Map<string, DimensionDetail>();

  for (const type of types) {
    const typeValues = (valuesByType.get(type.id) ?? []).map(toValue);
    const standard = type.standardDimension;

    if (standard === null) {
      if (type.slug === null) continue;
      dimensions.set(type.slug, {
        slug: type.slug,
        name: displayName(type.name),
        standard: false,
        hasSchemes: false,
        schemes: [],
        values: typeValues,
      });
      continue;
    }

    const hasSchemes = !SCHEMELESS_DIMENSIONS.includes(standard);
    const dimension = dimensions.get(standard) ?? {
      slug: standard,
      name: STANDARD_DIMENSION_LABELS[standard],
      standard: true,
      hasSchemes,
      schemes: [],
      values: [],
    };
    dimensions.set(standard, dimension);

    if (!hasSchemes) {
      mergeValues(dimension.values, typeValues);
      continue;
    }
    if (type.slug === null) continue;

    const existing = dimension.schemes.find((scheme) => scheme.slug === type.slug);
    if (existing) {
      mergeValues(existing.values, typeValues);
      if (existing.structure && type.groups !== null) {
        existing.structure.groups = [...new Set([...existing.structure.groups, type.groups])].sort(
          (a, b) => a - b,
        );
      }
      continue;
    }
    dimension.schemes.push({
      slug: type.slug,
      name: displayName(type.name),
      structure:
        type.release === null ||
        type.ranked === null ||
        type.within === null ||
        type.groups === null
          ? null
          : {
              release: type.release,
              ranked: type.ranked,
              within: type.within,
              boundaries: type.boundaries,
              groups: [type.groups],
            },
      values: typeValues,
    });
  }

  const order = (slug: string) => {
    const index = STANDARD_DIMENSIONS.indexOf(slug as (typeof STANDARD_DIMENSIONS)[number]);
    return index === -1 ? STANDARD_DIMENSIONS.length : index;
  };
  return new Map([...dimensions].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b)));
}

function summary({ slug, name, standard, hasSchemes }: DimensionDetail): Dimension {
  return { slug, name, standard, hasSchemes };
}

function isSlug(value: string): boolean {
  return SLUG_PATTERN.test(value) && value.length <= 100;
}

export function dimensionsRouter(reference: Repositories['reference']): Router {
  const router = Router();

  async function load() {
    const { types, values } = await reference.listDimensions();
    return toDimensions(types, values);
  }

  router.get('/v0/dimensions', async (request, response) => {
    if (parseQuery(request, response, {}) === undefined) return;
    const format = negotiate(request, response, ['csv', 'json']);
    if (format === undefined) return;
    if (notModified(request, response, await reference.dataVersion(), format)) return;

    sendTable(response, format, DIMENSION_COLUMNS, [...(await load()).values()].map(summary));
  });

  router.get('/v0/dimensions/:dimension', async (request, response) => {
    if (parseQuery(request, response, {}) === undefined) return;
    const format = negotiate(request, response, ['json']);
    if (format === undefined) return;
    if (notModified(request, response, await reference.dataVersion(), format)) return;

    const dimension = isSlug(request.params.dimension)
      ? (await load()).get(request.params.dimension)
      : undefined;
    if (!dimension) {
      sendProblem(
        response,
        404,
        'not_found',
        `No dimension is called '${request.params.dimension}'.`,
      );
      return;
    }
    response.json(dimension);
  });

  router.get('/v0/dimensions/:dimension/schemes/:scheme', async (request, response) => {
    if (parseQuery(request, response, {}) === undefined) return;
    const format = negotiate(request, response, ['json']);
    if (format === undefined) return;
    if (notModified(request, response, await reference.dataVersion(), format)) return;

    const { dimension: dimensionSlug, scheme: schemeSlug } = request.params;
    const scheme =
      isSlug(dimensionSlug) && isSlug(schemeSlug)
        ? (await load()).get(dimensionSlug)?.schemes.find(({ slug }) => slug === schemeSlug)
        : undefined;
    if (!scheme) {
      sendProblem(
        response,
        404,
        'not_found',
        `No ${dimensionSlug} scheme is called '${schemeSlug}'.`,
      );
      return;
    }
    response.json(scheme);
  });

  return router;
}
