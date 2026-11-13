import type { ApiClient, ApiResponseSchema } from '@fphd/web-server/api-client';

/**
 * The client for one page load, which sends each GET once. A repeated GET for the same path and
 * schema gets the first call's answer, or its error, instead of a second request to the API.
 */
export function createSharedGetsClient(api: ApiClient): ApiClient {
  const answers = new Map<ApiResponseSchema<unknown>, Map<string, Promise<unknown>>>();
  return {
    ...api,
    get<T>(path: string, schema: ApiResponseSchema<T>): Promise<T> {
      const bySchema = answers.get(schema) ?? new Map<string, Promise<unknown>>();
      answers.set(schema, bySchema);
      const answer = bySchema.get(path) ?? api.get(path, schema);
      bySchema.set(path, answer);
      return answer as Promise<T>;
    },
  };
}
