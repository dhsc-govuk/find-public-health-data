import type { RouteConfigEntry } from '@react-router/dev/routes';

/**
 * Gives every route an id that DAC's App Gateway lets through in a query string, keeping any id
 * already set.
 *
 * Route ids reach the network: a data request that loads only some of a page's routes lists their
 * ids in its `_routes` query parameter. React Router's default id is the route module's path, which
 * for a module in a package is `../../../packages/<package>/src/<path>`. The gateway's WAF refuses
 * a query value containing `../`, the word `src`, or 12 or more characters such as `-`, so that
 * request never reaches the app. The id here is `<package>/<path>` instead, with `_` for `-`: the
 * module's path for a module in the app, `public_web_features/topic/list_route` for one in a
 * package.
 */
export function withRouteIds(routes: RouteConfigEntry[]): RouteConfigEntry[] {
  return routes.map(({ children, ...entry }) => ({
    ...entry,
    id: entry.id ?? routeId(entry.file),
    ...(children === undefined ? {} : { children: withRouteIds(children) }),
  }));
}

function routeId(file: string): string {
  return file
    .replace(/^(?:\.\.?\/)+/, '')
    .replace(/^packages\/([^/]+)\/src\//, '$1/')
    .replace(/\.tsx?$/, '')
    .replaceAll('-', '_');
}
