import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, fails } from '@fphd/web-server/testing';
import { type LoaderFunctionArgs, RouterContextProvider } from 'react-router';
import { expect, it } from 'vitest';
import { loader } from './compare-areas-route.ts';

it.each(['parents', 'neighbours'])(
  'keeps the successful response when %s fail',
  async (failure) => {
    const neighbours = [{ code: 'E06000001', neighbours: ['E06000006'] }];
    const parent = { code: 'E12000001', name: 'North East' };
    const api = createFakeApiClient({
      'GET /api/indicators/indicator-108/areas':
        failure === 'parents'
          ? fails(new Response(null, { status: 503 }))
          : [
              {
                displayGroup: 'Local authorities',
                areas: [{ code: 'E06000001', name: 'Hartlepool', parent }],
              },
            ],
      'GET /api/areas/neighbours':
        failure === 'neighbours' ? fails(new Response(null, { status: 503 })) : neighbours,
    });
    const context = new RouterContextProvider();
    context.set(apiContext, api);
    const response = await loader({
      context,
      params: {},
      request: new Request(
        'http://localhost/compare-areas?indicator=indicator-108&displayGroup=Local+authorities&parents=1&areaCode=E06000001',
      ),
    } as unknown as LoaderFunctionArgs);
    expect(await response.json()).toEqual({
      parents: failure === 'parents' ? null : [{ code: 'E06000001', parent }],
      neighbours: failure === 'neighbours' ? null : neighbours,
    });
  },
);
