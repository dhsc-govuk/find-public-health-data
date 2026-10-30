import { describe, expect, it } from 'vitest';

import { meta } from './route.tsx';

const list = { canCreate: true, indicators: [], page: 1, totalPages: 1 };
const underReview = { unassigned: [], assigned: [] };

function titleFor(loaderData: unknown) {
  return meta({ loaderData } as Parameters<typeof meta>[0]);
}

describe('the dashboard route', () => {
  it.each([
    ['an IMRG manager', { underReview, toReview: null, list: null }],
    ['an IMRG reviewer', { underReview: null, toReview: [], list: null }],
  ])('titles the page for %s as its heading, the indicators under review', (_who, loaderData) => {
    expect(titleFor(loaderData)).toEqual([
      { title: 'Indicators under review - Find public health data - GOV.UK' },
    ]);
  });

  it.each([
    ['a publisher', { underReview: null, toReview: null, list }],
    ['an IMRG manager who also publishes', { underReview, toReview: null, list }],
    ['an IMRG reviewer who also publishes', { underReview: null, toReview: [], list }],
    ['a page whose loader failed', undefined],
  ])('titles the page for %s as Indicators', (_who, loaderData) => {
    expect(titleFor(loaderData)).toEqual([
      { title: 'Indicators - Find public health data - GOV.UK' },
    ]);
  });
});
