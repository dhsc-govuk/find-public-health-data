import { indicatorPageDetailSchema } from '@fphd/public-api-features/contract';
import { apiContext } from '@fphd/web-server/api-context';
import { createFakeApiClient, type FakeApiClient } from '@fphd/web-server/testing';
import { type LoaderFunctionArgs, RouterContextProvider } from 'react-router';
import { expect, it } from 'vitest';

import { publicIndicatorLinks } from './links.ts';
import { loadIndicatorMetadata as loader } from './metadata-route.ts';
import { indicatorPageContext } from './page-context.ts';
import { indicatorDetail } from './view.testing.ts';

const unanswered = {
  ...indicatorDetail(108),
  valueType: null,
  unit: null,
  updateFrequency: null,
  timePeriods: null,
  unanswered: ['valueType', 'unit', 'updateFrequency', 'timePeriods'],
  dataState: 'no-upload',
};

function args(api: FakeApiClient, preview: boolean): LoaderFunctionArgs {
  const context = new RouterContextProvider();
  context.set(apiContext, api);
  if (preview) {
    context.set(indicatorPageContext, {
      detailSchema: indicatorPageDetailSchema,
      links: { ...publicIndicatorLinks, metadata: () => '/preview/metadata.txt' },
    });
  }
  return {
    context,
    params: { slug: 'indicator-108' },
    request: new Request('http://localhost/indicator/indicator-108/metadata.txt'),
  } as unknown as LoaderFunctionArgs;
}

it("gives a preview's unanswered questions as [Not entered yet]", async () => {
  const api = createFakeApiClient({ 'GET /api/indicators/indicator-108': unanswered });

  const text = await (await loader(args(api, true))).text();

  expect(text).toContain('Value type: [Not entered yet]');
  expect(text).toContain('Unit: [Not entered yet]');
  expect(text).toContain('Update frequency: [Not entered yet]');
  expect(text).toContain('Time periods: [Not entered yet]');
});

it('gives the time periods in place of the year type', async () => {
  const api = createFakeApiClient({ 'GET /api/indicators/indicator-108': indicatorDetail(108) });

  const text = await (await loader(args(api, false))).text();

  expect(text).toContain('Time periods: Calendar years (1 January to 31 December)');
  expect(text).not.toContain('Year type');
  expect(text).not.toContain('Rolling time periods');
});

it('gives time periods that roll, with their frequency, after the time periods', async () => {
  const api = createFakeApiClient({
    'GET /api/indicators/indicator-108': { ...indicatorDetail(108), rollingFrequency: 'months' },
  });

  const text = await (await loader(args(api, false))).text();

  expect(text).toContain(
    'Time periods: Calendar years (1 January to 31 December)\n\nRolling time periods: Months',
  );
});

it('never gives a placeholder on the public side, whose schema drops the unanswered list', async () => {
  const api = createFakeApiClient({
    'GET /api/indicators/indicator-108': {
      ...indicatorDetail(108),
      unit: null,
      unanswered: ['unit'],
    },
  });

  const text = await (await loader(args(api, false))).text();

  expect(text).not.toContain('[Not entered yet]');
  expect(text).not.toContain('Unit:');
});

it('gives the caveats before the notes, as the page shows them', async () => {
  const api = createFakeApiClient({
    'GET /api/indicators/indicator-108': {
      ...indicatorDetail(108),
      caveats: 'Survey data.',
      notes: 'Revised in 2024.',
    },
  });

  const text = await (await loader(args(api, false))).text();

  expect(text).toContain('Caveats: Survey data.\n\nNotes: Revised in 2024.');
});

it('gives the methodology under the label the page shows it with', async () => {
  const api = createFakeApiClient({
    'GET /api/indicators/indicator-108': {
      ...indicatorDetail(108),
      methodology: 'Value and count are the same.',
    },
  });

  const text = await (await loader(args(api, false))).text();

  expect(text).toContain('How the indicator was calculated: Value and count are the same.');
  expect(text).not.toContain('Methodology:');
});
