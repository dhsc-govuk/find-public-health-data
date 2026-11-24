import { describe, expect, it } from 'vitest';
import { areaTypeNotice } from './area-type-notice.ts';
import { observation } from './view.testing.ts';

const ALL_LEVELS = [
  'Integrated care boards (ICBs)',
  'Upper-tier local authorities',
  'Lower-tier local authorities',
  'Middle layer super output areas (MSOAs)',
  'NHS regions',
  'Statistical regions',
];
const ENGLAND = [{ name: 'England', areaCount: 1 }];
const england = (value: number | null) => [
  { areaCode: 'E92000001', observations: [{ ...observation(10), value }] },
];

describe('areaTypeNotice', () => {
  it('says England is the only geography when the indicator has no area types', () => {
    expect(
      areaTypeNotice({
        catalogueLevels: ALL_LEVELS,
        indicatorLevels: [],
        areaTypes: ENGLAND,
        areaData: england(10),
      }),
    ).toBe('england-only');
  });

  it('says nothing when there are no area types and England has no value', () => {
    expect(
      areaTypeNotice({
        catalogueLevels: ALL_LEVELS,
        indicatorLevels: [],
        areaTypes: ENGLAND,
        areaData: england(null),
      }),
    ).toBeUndefined();
    expect(
      areaTypeNotice({
        catalogueLevels: ALL_LEVELS,
        indicatorLevels: [],
        areaTypes: ENGLAND,
        areaData: [],
      }),
    ).toBeUndefined();
  });

  it.each([
    'GPs',
    'Acute Trust',
    'ICB sub-locations',
    'PCNs (v. 26/06/25)',
    'LA obsolete 2023',
    'UK',
  ])('says nothing when the data also covers %s, which the public site does not offer', (name) => {
    expect(
      areaTypeNotice({
        catalogueLevels: ALL_LEVELS,
        indicatorLevels: [],
        areaTypes: [...ENGLAND, { name }],
        areaData: england(10),
      }),
    ).toBeUndefined();
  });

  it('says nothing when the area types the data covers are unknown', () => {
    expect(
      areaTypeNotice({
        catalogueLevels: ALL_LEVELS,
        indicatorLevels: [],
        areaTypes: [],
        areaData: england(10),
      }),
    ).toBeUndefined();
  });

  it('points out a missing area type', () => {
    expect(
      areaTypeNotice({
        catalogueLevels: ALL_LEVELS,
        indicatorLevels: ALL_LEVELS.filter((level) => level !== 'NHS regions'),
        areaTypes: ENGLAND,
        areaData: england(10),
      }),
    ).toBe('others-unavailable');
  });

  it('leaves out MSOAs', () => {
    expect(
      areaTypeNotice({
        catalogueLevels: ALL_LEVELS,
        indicatorLevels: ALL_LEVELS.filter((level) => !level.includes('MSOAs')),
        areaTypes: ENGLAND,
        areaData: england(10),
      }),
    ).toBeUndefined();
  });

  it('leaves out an area type the catalogue does not hold', () => {
    expect(
      areaTypeNotice({
        catalogueLevels: ['Statistical regions'],
        indicatorLevels: ['Statistical regions'],
        areaTypes: ENGLAND,
        areaData: england(null),
      }),
    ).toBeUndefined();
  });
});
