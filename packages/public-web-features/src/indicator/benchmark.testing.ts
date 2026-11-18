import { type DeprivationMembership, deprivationType } from './benchmarks.ts';
import type { BenchmarkChoice } from './comparison.ts';
import type { BenchmarkGeography, IndicatorAreaData } from './loader.ts';
import { indicatorDetail, observation, sex } from './view.testing.ts';

export function benchmarkFixture() {
  const memberships: DeprivationMembership[] = ['E08000003', 'E06000052'].flatMap((code, index) =>
    (['IMD2019', 'IMD2025'] as const).map((scheme, schemeIndex) => ({
      code,
      scheme,
      tier: 'upper',
      decile: index + 1,
      dimensionTypeId: `019de0d5-c800-700a-8000-00000000000${schemeIndex}`,
      dimensionValueId: `019de0d5-c800-700b-8000-0000000000${schemeIndex}${index}`,
    })),
  );
  const decileObservation = (membership: DeprivationMembership, value: number) =>
    observation(value, [
      sex('Female'),
      {
        type: deprivationType(membership),
        value: `Decile ${membership.decile}`,
        dimensionClass: 'inequality',
        sortOrder: membership.decile,
      },
    ]);
  const area = (areaCode: string, areaName: string, value: number): IndicatorAreaData => ({
    areaCode,
    areaName,
    observations: [observation(value, [sex('Female')])],
  });
  const geography: BenchmarkGeography & { deprivation: DeprivationMembership[] } = {
    regionByCode: {
      E08000003: { code: 'E12000002', name: 'North West' },
      E06000052: { code: 'E12000009', name: 'South West' },
    },
    levelByCode: {
      E08000003: 'Upper-tier local authorities',
      E06000052: 'Upper-tier local authorities',
    },
    deprivation: memberships,
    neighboursByCode: {
      E08000003: ['E08000001', 'E08000002'],
      E06000052: ['E08000001', 'E08000002'],
    },
    caByCode: {
      E08000003: { code: 'E47000001', name: 'Greater Manchester' },
      E06000052: { code: 'E47000002', name: 'Other CA' },
    },
  };
  const england = area('E92000001', 'England', 5);
  england.observations.push(
    ...memberships.map((membership, index) => decileObservation(membership, 7 + index)),
  );
  const areaData = [area('E08000003', 'Manchester', 3), area('E06000052', 'Cornwall', 8), england];
  return {
    area,
    decileObservation,
    geography,
    detail: indicatorDetail(108, {
      goal: { lower: 4, upper: 6, polarity: 'lower-is-better', policyDetail: null },
    }),
    areaData,
    lookup: areaData
      .filter(({ areaCode }) => areaCode !== 'E92000001')
      .map(({ areaCode, areaName }) => ({
        code: areaCode,
        name: areaName,
        areaType: 'UA unchanged',
        displayGroup: geography.levelByCode[areaCode] ?? 'Local authorities',
        benchmarks: {
          deprivation: memberships.filter(({ code }) => code === areaCode),
          neighbours: geography.neighboursByCode?.[areaCode] ?? [],
          combinedAuthority: geography.caByCode?.[areaCode] ?? null,
        },
      })),
    regionData: [area('E12000002', 'North West', 5), area('E12000009', 'South West', 6)],
    benchmarkData: [
      area('E08000001', 'Neighbour A', 10),
      area('E08000002', 'Neighbour B', 20),
      area('E47000001', 'Greater Manchester', 9),
    ],
    ranges: Object.fromEntries(
      [
        'england:upper',
        'region:E12000002:upper',
        'region:E12000009:upper',
        ...memberships.map(({ dimensionValueId }) => dimensionValueId),
      ].map((key) => [
        key,
        [
          {
            fromDate: '2024-01-01',
            toDate: '2024-12-31',
            segment: 'Female',
            min: 1,
            p25: 2,
            p75: 20,
            max: 30,
          },
        ],
      ]),
    ),
    benchmarks: [
      'goal',
      'ca:E08000003',
      'ca:E06000052',
      'neighbours:E08000003',
      'neighbours:E06000052',
      'imd2025',
      'imd2019',
      'region',
      'england',
    ] satisfies BenchmarkChoice[],
  };
}
