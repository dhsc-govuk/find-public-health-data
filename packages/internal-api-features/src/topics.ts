import { requireApiActor, requireJwtRole } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import type { Topic } from '@fphd/db';
import { Router } from 'express';

import {
  editVersionedSchema,
  type TopicAdminDetail,
  type TopicAdminDetailWithLinkCount,
  type TopicAdminSummary,
  type TopicDeleteError,
  toFieldErrors,
  topicFieldSchema,
  topicIdSchema,
  topicUpdateSchema,
} from './contract.ts';
import { editVersion } from './edit-version.ts';
import type { InternalTopicRepository } from './repositories.ts';

function toSummary({ id, slug, title, createdAt, updatedAt }: Topic): TopicAdminSummary {
  return {
    id,
    slug,
    title,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

/** The version of the fields the topic form edits, which a save must send back. */
function topicVersion({ title, slug, description }: Topic): string {
  return editVersion({ title, slug, description });
}

function toDetail(topic: Topic): TopicAdminDetail {
  return { ...toSummary(topic), description: topic.description, version: topicVersion(topic) };
}

/**
 * The admin's view of topics: the same rows the public API serves, plus the ids a write
 * needs to address. Mounted only by `internal-api`; `public-api` must 404 every path here.
 */
export function internalTopicsRouter(
  topics: InternalTopicRepository,
  session: JwtSessionVerifier,
): Router {
  const router = Router();
  const requireAdmin = requireJwtRole(session, 'admin');

  router.get('/api/internal/topics', requireAdmin, async (_request, response) => {
    response.status(200).json((await topics.list()).map(toSummary));
  });

  router.post('/api/internal/topics', requireAdmin, async (request, response) => {
    const submission = topicUpdateSchema.safeParse(request.body);

    if (!submission.success) {
      response.status(400).json({
        error: 'validation_failed',
        fieldErrors: toFieldErrors(submission.error, topicFieldSchema),
      });
      return;
    }

    const result = await topics.create(submission.data, requireApiActor(request, response));

    if (!result.ok) {
      response
        .status(409)
        .json({ error: 'slug_taken', fieldErrors: { slug: 'This slug is already used' } });
      return;
    }

    response.status(201).json({ topic: toDetail(result.topic) });
  });

  router.get('/api/internal/topics/:id', requireAdmin, async (request, response) => {
    const id = topicIdSchema.safeParse(request.params.id);

    // Handing an unparseable id to the database would surface as a 500; it is a bad request.
    if (!id.success) {
      response.status(400).json({ error: 'invalid_id' });
      return;
    }

    const [topic, linkedIndicatorCount] = await Promise.all([
      topics.findById(id.data),
      topics.countLinkedIndicators(id.data),
    ]);

    if (!topic) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    response
      .status(200)
      .json({ ...toDetail(topic), linkedIndicatorCount } satisfies TopicAdminDetailWithLinkCount);
  });

  router.put('/api/internal/topics/:id', requireAdmin, async (request, response) => {
    const id = topicIdSchema.safeParse(request.params.id);

    if (!id.success) {
      response.status(400).json({ error: 'invalid_id' });
      return;
    }

    const versioned = editVersionedSchema.safeParse(request.body);

    if (!versioned.success) {
      response.status(400).json({ error: 'invalid_version' });
      return;
    }

    // Validated for the same reason as the create above.
    const submission = topicUpdateSchema.safeParse(request.body);

    if (!submission.success) {
      response.status(400).json({
        error: 'validation_failed',
        fieldErrors: toFieldErrors(submission.error, topicFieldSchema),
      });
      return;
    }

    const result = await topics.update(
      id.data,
      submission.data,
      requireApiActor(request, response),
      { version: versioned.data.version, versionOf: topicVersion },
    );

    if (!result.ok) {
      if (result.reason === 'not_found') {
        response.status(404).json({ error: 'not_found' });
        return;
      }

      if (result.reason === 'changed') {
        response.status(409).json({ error: 'changed', version: result.version });
        return;
      }

      response
        .status(409)
        .json({ error: 'slug_taken', fieldErrors: { slug: 'This slug is already used' } });
      return;
    }

    response.status(200).json({ changed: result.changed, topic: toDetail(result.topic) });
  });

  router.delete('/api/internal/topics/:id', requireAdmin, async (request, response) => {
    const id = topicIdSchema.safeParse(request.params.id);

    if (!id.success) {
      response.status(400).json({ error: 'invalid_id' });
      return;
    }

    const result = await topics.delete(id.data, requireApiActor(request, response));

    if (!result.ok) {
      if (result.reason === 'in_use') {
        response.status(409).json({ error: 'in_use' } satisfies TopicDeleteError);
        return;
      }

      response.status(404).json({ error: 'not_found' });
      return;
    }

    response.status(204).end();
  });

  return router;
}
