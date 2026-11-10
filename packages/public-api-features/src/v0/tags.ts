import type { Repositories, TagRow } from '@fphd/db';
import type { ClassificationDimension } from '@fphd/utils/classification-dimension';
import { Router } from 'express';

import { listItems, listParam, negotiate, notModified, parseQuery, sendTable } from './http.ts';

export const TAG_TYPES = [
  'topic',
  'subtopic',
  'indicator-type',
  'population',
  'inequality',
  'framework',
  'life-stage',
] as const;

export type TagType = (typeof TAG_TYPES)[number];

// The public API's values are slugs, so the classification dimensions' underscores become hyphens.
const TAG_TYPE_OF_DIMENSION: Record<ClassificationDimension, TagType> = {
  indicator_type: 'indicator-type',
  population: 'population',
  inequality: 'inequality',
  framework: 'framework',
  life_stage: 'life-stage',
};

export interface Tag {
  slug: string;
  name: string;
  type: TagType;
  parent: string | null;
}

export const TAG_COLUMNS = ['slug', 'name', 'type', 'parent'] as const;

/**
 * A subtopic's slug is unique only within its topic: two topics have a "stroke" subtopic. Its
 * tag slug carries the topic's, so that every tag slug is unique and the catalogue can take them
 * in one list.
 */
export function subtopicTagSlug(topicSlug: string, subtopicSlug: string): string {
  return `${topicSlug}-${subtopicSlug}`;
}

export function toTag(row: TagRow): Tag {
  switch (row.kind) {
    case 'topic':
      return { slug: row.slug, name: row.name, type: 'topic', parent: null };
    case 'subtopic':
      return {
        slug: subtopicTagSlug(row.topicSlug, row.slug),
        name: row.name,
        type: 'subtopic',
        parent: row.topicSlug,
      };
    case 'classification':
      return {
        slug: row.slug,
        name: row.name,
        type: TAG_TYPE_OF_DIMENSION[row.dimension as ClassificationDimension],
        parent: null,
      };
  }
}

const TAG_TYPE_PATTERN = new RegExp(`^(${TAG_TYPES.join('|')})$`);

export function tagsRouter(reference: Repositories['reference']): Router {
  const router = Router();

  router.get('/v0/tags', async (request, response) => {
    const query = parseQuery(request, response, {
      type: listParam(TAG_TYPE_PATTERN, `one of ${TAG_TYPES.join(', ')}`),
    });
    if (query === undefined) return;

    const format = negotiate(request, response, ['csv', 'json']);
    if (format === undefined) return;

    if (notModified(request, response, await reference.dataVersion(), format)) return;

    const types = listItems(query.type);
    const tags = (await reference.listTags())
      .map(toTag)
      .filter((tag) => types === undefined || types.includes(tag.type));

    sendTable(response, format, TAG_COLUMNS, tags);
  });

  return router;
}
