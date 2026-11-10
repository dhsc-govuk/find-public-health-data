import { z } from '@fphd/config/zod';
import { describe, expect, it } from 'vitest';

import { createFakeApiClient, fails, noContent, refused } from './testing.ts';

const topicSchema = z.object({ slug: z.string(), updatedAt: z.iso.datetime() });
const errorSchema = z.object({ error: z.enum(['changed', 'locked']) });
const topic = { slug: 'air-quality', updatedAt: '2026-01-02T00:00:00.000Z' };

describe('createFakeApiClient', () => {
  it("answers a stubbed read with the body, parsed by the caller's schema", async () => {
    const api = createFakeApiClient({ 'GET /api/topics/air-quality': topic });

    await expect(api.get('/api/topics/air-quality', topicSchema)).resolves.toEqual(topic);
  });

  it("fails a read whose stub does not match the caller's schema, naming the call", async () => {
    const api = createFakeApiClient({ 'GET /api/topics/air-quality': { slug: 'air-quality' } });

    await expect(api.get('/api/topics/air-quality', topicSchema)).rejects.toThrow(
      /GET \/api\/topics\/air-quality does not match the schema[\s\S]*updatedAt/,
    );
  });

  it('fails a call the test did not stub', async () => {
    const api = createFakeApiClient({ 'GET /api/topics': [] });

    await expect(api.get('/api/topics/air-quality', topicSchema)).rejects.toThrow(
      'The API was called (GET /api/topics/air-quality) but this test did not stub it',
    );
  });

  it('keeps a stub to its method', async () => {
    const api = createFakeApiClient({ 'GET /api/topics/air-quality': topic });

    await expect(api.put('/api/topics/air-quality', {}, topicSchema, errorSchema)).rejects.toThrow(
      'PUT /api/topics/air-quality',
    );
  });

  it('throws what a stub says the client throws', async () => {
    const api = createFakeApiClient({
      'GET /api/topics/gone': fails(new Response('Not Found', { status: 404 })),
    });

    await expect(api.get('/api/topics/gone', topicSchema)).rejects.toMatchObject({ status: 404 });
  });

  it('answers a write with the parsed body, recording what was sent', async () => {
    const api = createFakeApiClient({ 'PUT /api/topics/air-quality': topic });

    const result = await api.put(
      '/api/topics/air-quality',
      { title: 'Air' },
      topicSchema,
      errorSchema,
    );

    expect(result).toEqual({ ok: true, data: topic });
    expect(api.calls).toEqual([
      { method: 'PUT', path: '/api/topics/air-quality', body: { title: 'Air' } },
    ]);
  });

  it("answers a refusal with its error parsed by the caller's error schema", async () => {
    const api = createFakeApiClient({
      'PATCH /api/topics/air-quality': refused(409, { error: 'locked' }),
    });

    await expect(
      api.patch('/api/topics/air-quality', {}, topicSchema, errorSchema),
    ).resolves.toEqual({ ok: false, status: 409, error: { error: 'locked' } });
  });

  it("fails a refusal whose error does not match the caller's error schema", async () => {
    const api = createFakeApiClient({
      'POST /api/topics': refused(400, { error: 'unheard_of' }),
    });

    await expect(api.post('/api/topics', {}, topicSchema, errorSchema)).rejects.toThrow(
      'does not match the schema',
    );
  });

  it('fails a refusal with a status the real client throws for instead', async () => {
    const api = createFakeApiClient({
      'DELETE /api/topics/air-quality': refused(400, { error: 'locked' }),
    });

    await expect(api.delete('/api/topics/air-quality', errorSchema)).rejects.toThrow(
      'delete never returns a 400 refusal',
    );
  });

  it('answers a delete or an action on a member with no content', async () => {
    const api = createFakeApiClient({
      'DELETE /api/topics/air-quality': noContent,
      'POST /api/topics/air-quality/archive': noContent,
    });

    await expect(api.delete('/api/topics/air-quality', errorSchema)).resolves.toEqual({
      ok: true,
      data: undefined,
    });
    await expect(
      api.postToMember('/api/topics/air-quality/archive', {}, errorSchema),
    ).resolves.toEqual({ ok: true, data: undefined });
  });

  it('fails a no-content call stubbed with a body', async () => {
    const api = createFakeApiClient({ 'DELETE /api/topics/air-quality': topic });

    await expect(api.delete('/api/topics/air-quality', errorSchema)).rejects.toThrow(
      'stub DELETE /api/topics/air-quality with noContent',
    );
  });

  it('works an answer out from the call when the stub is a function', async () => {
    const api = createFakeApiClient({
      'PUT /api/topics/air-quality': (call) =>
        (call.body as { version: string }).version === 'old'
          ? refused(409, { error: 'changed' })
          : topic,
    });

    await expect(
      api.put('/api/topics/air-quality', { version: 'old' }, topicSchema, errorSchema),
    ).resolves.toMatchObject({ ok: false, status: 409 });
    await expect(
      api.put('/api/topics/air-quality', { version: 'new' }, topicSchema, errorSchema),
    ).resolves.toEqual({ ok: true, data: topic });
  });
});
