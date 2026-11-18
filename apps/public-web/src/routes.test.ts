import type { RouteConfigEntry } from '@react-router/dev/routes';
import { describe, expect, it } from 'vitest';

import routes from './routes.ts';

function routeIds(entries: RouteConfigEntry[]): Array<string | undefined> {
  return entries.flatMap((entry) => [entry.id, ...routeIds(entry.children ?? [])]);
}

describe('routes', () => {
  // A data request lists route ids in its _routes query parameter. DAC's App Gateway refuses a
  // query value containing ../, the word src, or 12 or more characters such as -.
  it('gives every route an id the gateway lets through', () => {
    const ids = routeIds(routes);

    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9_]+(?:\/[a-z0-9_]+)*$/);
      expect(id).not.toMatch(/(?:^|\/)src(?:\/|$)/);
    }
  });
});
