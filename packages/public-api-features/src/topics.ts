import type { Repositories, Topic } from '@fphd/db';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@fphd/utils/slug';
import { Router } from 'express';

import type { TopicSummary } from './contract.ts';
import { contentForTopic } from './topic-content.ts';

function toSummary({ slug, title, description, createdAt, updatedAt }: Topic): TopicSummary {
  return {
    slug,
    title,
    description,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

/** A segment that isn't a slug names no topic, so it never reaches the database. */
async function findTopic(topics: Repositories['topics'], slug: string): Promise<Topic | undefined> {
  return SLUG_PATTERN.test(slug) && slug.length <= SLUG_MAX_LENGTH
    ? topics.findBySlug(slug)
    : undefined;
}

/**
 * Topics are public data, so both APIs mount this unchanged — internal-api is a superset of
 * the public surface by mounting the same routers, not by re-declaring them.
 */
export function topicsRouter(topics: Repositories['topics']): Router {
  const router = Router();

  router.get('/api/topics', async (_request, response) => {
    response.status(200).json((await topics.list()).map(toSummary));
  });

  router.get('/api/topics/:slug', async (request, response) => {
    const topic = await findTopic(topics, request.params.slug);

    if (!topic) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    response.status(200).json({
      ...toSummary(topic),
      subtopics: await topics.listSubtopics(topic.slug),
      content: contentForTopic(topic.slug),
    });
  });

  router.get('/api/topics/:slug/trends', async (request, response) => {
    const topic = await findTopic(topics, request.params.slug);
    if (!topic) {
      response.status(404).json({ error: 'not_found' });
      return;
    }
    response.status(200).json(await topics.trendSummary(topic.slug));
  });

  return router;
}
