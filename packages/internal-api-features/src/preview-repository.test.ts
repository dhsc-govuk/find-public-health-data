import { publishedViews, type ViewSet } from '@fphd/db';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { expect, it } from 'vitest';

import { previewViews } from './preview-repository.ts';

const db = drizzle.mock({ casing: 'snake_case' });

/** One query that reads a versioned view, another versioned view and a reference view. */
function topicIndicatorUnits({ indicator, indicatorTopic, unit }: ViewSet): string {
  return db
    .select({ name: indicator.name, unit: unit.name, firstPublishedAt: indicator.firstPublishedAt })
    .from(indicator)
    .innerJoin(indicatorTopic, eq(indicatorTopic.indicatorId, indicator.id))
    .leftJoin(unit, eq(unit.id, indicator.unitId))
    .where(eq(indicator.shortId, 108))
    .toSQL().sql;
}

it('reads the preview schema for versioned views and the published schema for reference views', () => {
  const preview = topicIndicatorUnits(previewViews);

  expect(preview).toContain('from "preview"."indicator"');
  expect(preview).toContain('join "preview"."indicator_topic"');
  expect(preview).toContain('join "published"."unit"');
  expect(preview).not.toContain('"published"."indicator');
});

it('names the same columns as the same query on the published views', () => {
  const published = topicIndicatorUnits(publishedViews);
  const preview = topicIndicatorUnits(previewViews);

  expect(preview).toBe(published.replaceAll('"published"."indicator', '"preview"."indicator'));
  // Built again after the preview query, the published one is unchanged.
  expect(topicIndicatorUnits(publishedViews)).toBe(published);
});
