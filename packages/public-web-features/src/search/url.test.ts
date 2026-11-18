import { describe, expect, it } from 'vitest';

import { LIST_PARAMS, type SearchState, searchUrl } from './url.ts';

const EVERY_FILTER: SearchState = {
  q: 'diabetes',
  topics: ['diabetes'],
  indicatorTypes: ['indicator-type-outcome'],
  lifeStages: ['older-people'],
  frameworks: ['framework-public-health-outcomes-framework'],
  populations: ['adults'],
  inequalities: ['deprivation'],
  sources: ['NHS England', 'OHID, based on multiple sources'],
  valueTypes: ['Proportion'],
  yearTypes: ['Calendar'],
  geoLevels: ['NHS regions'],
  gaCodes: ['E40000003'],
  fromYear: '2015',
  toYear: '2023',
  updatedWithin: '12',
  subtopics: ['prevalence-and-risk'],
};

describe('searchUrl', () => {
  it('puts the data sources in the source parameter', () => {
    const params = new URL(searchUrl(EVERY_FILTER), 'http://localhost').searchParams;

    expect(params.getAll('source')).toEqual(EVERY_FILTER.sources);
  });

  // DAC's App Gateway refuses a query string containing the word src, so a search URL with one
  // never reaches the app there.
  it('never names a parameter with the word src', () => {
    const params = new URL(searchUrl(EVERY_FILTER), 'http://localhost').searchParams;

    expect([...params.keys()].filter((key) => /src/i.test(key))).toEqual([]);
    expect(LIST_PARAMS.filter(({ param }) => /src/i.test(param))).toEqual([]);
  });
});
