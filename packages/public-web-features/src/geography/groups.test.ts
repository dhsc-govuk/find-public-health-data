import { expect, it } from 'vitest';
import {
  areasInGeographyGroup,
  areaTypeLabel,
  normalizePublicLevels,
  publicGeographyLevels,
  sourceGeographyGroup,
} from './groups.ts';

it('separates counties and districts while including single-tier authorities in both tiers', () => {
  const areas = ['E06000001', 'E07000001', 'E08000001', 'E09000001', 'E10000001'].map((code) => ({
    code,
  }));
  expect(areasInGeographyGroup(areas, 'Upper-tier local authorities').map((a) => a.code)).toEqual([
    'E06000001',
    'E08000001',
    'E09000001',
    'E10000001',
  ]);
  expect(areasInGeographyGroup(areas, 'Lower-tier local authorities').map((a) => a.code)).toEqual([
    'E06000001',
    'E07000001',
    'E08000001',
    'E09000001',
  ]);
});
it('keeps old whole-authority links meaningful and maps labels back to the API catalogue', () => {
  expect(normalizePublicLevels(['Local authorities', 'NHS regions'])).toEqual([
    'Upper-tier local authorities',
    'Lower-tier local authorities',
    'NHS regions',
  ]);
  expect(sourceGeographyGroup('Upper-tier local authorities')).toBe('Local authorities');
  expect(
    publicGeographyLevels(['GP practices', 'Integrated care boards', 'Local authorities']),
  ).toEqual([
    'Integrated care boards (ICBs)',
    'Upper-tier local authorities',
    'Lower-tier local authorities',
  ]);
});

it.each([
  ['Local authorities', 'E10000032', 'Upper tier local authority'],
  ['Local authorities', 'E07000223', 'Lower tier local authority'],
  ['Local authorities', 'E06000043', 'Upper and lower tier local authority'],
  ['Local authorities', 'E08000003', 'Upper and lower tier local authority'],
  ['Local authorities', 'E09000033', 'Upper and lower tier local authority'],
  ['Integrated care boards', 'E54000064', 'Integrated care board'],
  ['Middle-layer super output areas', 'E02000001', 'Middle-layer super output area'],
  ['NHS regions', 'E40000005', 'NHS region'],
  ['Statistical regions', 'E12000008', 'Statistical region'],
  ['GP practices', 'A81001', 'GP practice'],
  ['England', 'E92000001', 'England'],
])('names a %s area %s as a single %s', (group, code, label) => {
  expect(areaTypeLabel(group, code)).toBe(label);
});
