import { readFileSync } from 'node:fs';

import { Router } from 'express';

// The package ships the spec beside `src` and `dist`, so the same path works from either.
const SPEC = readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8');

/** The OpenAPI document for this version, which documentation and client tools read. */
export function openApiRouter(): Router {
  const router = Router();

  router.get('/v0/openapi.yaml', (_request, response) => {
    response.set('Cache-Control', 'public, max-age=300');
    response.type('application/yaml').send(SPEC);
  });

  return router;
}
