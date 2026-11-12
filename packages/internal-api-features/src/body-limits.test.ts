import { request } from '@fphd/express/testing';
import { Router } from 'express';
import { describe, expect, it } from 'vitest';

import { createRouterTestApp } from './testing.ts';

const id = '00000000-0000-7000-8000-000000000001';

// About 150 kB of JSON: over the default 100 kB and under the 256 kB the larger sections take.
const overDefault = { answers: { text: 'x'.repeat(150_000) } };

// Answers any section's PUT with the length of what the body parser read, so only the body
// limits decide whether a request gets through.
function createTestApp() {
  const router = Router();
  router.put('/api/internal/indicators/:id/:section', (request, response) => {
    response.status(200).json({ length: request.body.answers.text.length });
  });
  return createRouterTestApp(router);
}

describe('the internal API body limits', () => {
  it.each(['justifications', 'links'])('reads a %s save over the default 100 kB', async (key) => {
    const response = await request(createTestApp())
      .put(`/api/internal/indicators/${id}/${key}`)
      .send(overDefault);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ length: 150_000 });
  });

  it.each(['polarity', 'definition-and-rationale'])(
    'refuses a %s save over the default 100 kB',
    async (key) => {
      const response = await request(createTestApp())
        .put(`/api/internal/indicators/${id}/${key}`)
        .send(overDefault);

      expect(response.status).toBe(413);
    },
  );
});
