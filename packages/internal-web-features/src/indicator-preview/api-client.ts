import { PREVIEW_API_PATH } from '@fphd/internal-api-features/contract';
import type { ApiClient } from '@fphd/web-server/api-client';

/**
 * The public API paths the indicator page and its downloads, lookups and search ask for. The
 * preview API mounts each again, so each has a preview path.
 */
const PREVIEWED_PATHS = [
  /^\/api\/indicators\/[^/]+$/,
  /^\/api\/indicators\/[^/]+\/(areas|data|range|ranking)$/,
  /^\/api\/indicators$/,
  /^\/api\/indicator-data$/,
  /^\/api\/indicator-scatter$/,
  /^\/api\/areas$/,
  /^\/api\/areas\/(display-groups|lookup|neighbours|parents|search)$/,
];

/** Thrown for a request the preview has no path for, so it never quietly reads published data. */
export class UnpreviewedApiPathError extends Error {
  constructor(method: string, path: string) {
    super(`The indicator preview has no path for ${method} ${path}`);
    this.name = 'UnpreviewedApiPathError';
  }
}

/**
 * The preview path of a public API path, which the preview API answers from the indicator's
 * draft or scheduled version. Throws for any path the preview doesn't know.
 */
export function previewApiPath(indicatorId: string, path: string): string {
  const pathname = path.split('?', 1)[0] ?? '';
  if (!PREVIEWED_PATHS.some((pattern) => pattern.test(pathname))) {
    throw new UnpreviewedApiPathError('GET', path);
  }
  return `${PREVIEW_API_PATH.replace(':id', encodeURIComponent(indicatorId))}${path}`;
}

function refuse(method: string) {
  return async (path: string): Promise<never> => {
    throw new UnpreviewedApiPathError(method, path);
  };
}

/**
 * A client that asks the preview API instead of the public one, for the public page's loaders
 * run as the preview of `indicatorId`. It refuses any path it can't map and any write, so a call
 * the preview has no path for fails instead of showing published data.
 */
export function createPreviewApiClient(api: ApiClient, indicatorId: string): ApiClient {
  return {
    get: async (path, schema) => api.get(previewApiPath(indicatorId, path), schema),
    put: refuse('PUT'),
    patch: refuse('PATCH'),
    post: refuse('POST'),
    postToMember: refuse('POST'),
    postStream: refuse('POST'),
    delete: refuse('DELETE'),
  };
}
