import type { ApiClient } from '@fphd/web-server/api-client';
import { expect, it, vi } from 'vitest';
import { loadAreaData } from './area-data.ts';

const hartlepool = { areaCode: 'E06000001', areaName: 'Hartlepool', observations: [] };

function api(body: unknown) {
  const get = vi.fn(async (_path: string, schema: { parse(value: unknown): unknown }) =>
    schema.parse(body),
  );
  return { client: { get } as unknown as ApiClient, get };
}

it('reads the bare object the API returns when only one requested code is accepted', async () => {
  const { client, get } = api(hartlepool);
  await expect(loadAreaData(client, '108', ['E06000001', 'U43072\r\n'])).resolves.toEqual([
    hartlepool,
  ]);
  expect(get).toHaveBeenCalledExactlyOnceWith(
    '/api/indicators/108/data?areaCode=E06000001',
    expect.anything(),
  );
});

it('asks for nothing when the API would accept none of the codes', async () => {
  const { client, get } = api([]);
  await expect(loadAreaData(client, '108', ['U43072\r\n'])).resolves.toEqual([]);
  expect(get).not.toHaveBeenCalled();
});
