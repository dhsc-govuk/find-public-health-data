import type { IndicatorObservation, SelectedIndicator } from './loader.ts';
import { deprivation, indicatorDetail, observation, sex } from './view.testing.ts';

export function sexedInequalities(): SelectedIndicator {
  const white = {
    type: 'Ethnic groups',
    value: 'White',
    dimensionClass: 'inequality',
    sortOrder: 1,
  } as const;
  const asian = { ...white, value: 'Asian', sortOrder: 2 };
  const point = (value: number, dimensions: IndicatorObservation['dimensions'], year = 2024) => ({
    ...observation(value, dimensions),
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  });
  const series = (sexValue: string, value: number, earlier?: number) => {
    const dimensions = sexValue ? [sex(sexValue)] : [];
    return [
      point(value, dimensions),
      point(value + 2, [...dimensions, white]),
      point(value + 4, [...dimensions, asian]),
      point(value + 6, [...dimensions, deprivation]),
      ...(earlier
        ? [point(value - 1, dimensions, earlier), point(value + 1, [...dimensions, white], earlier)]
        : []),
    ];
  };
  return {
    detail: indicatorDetail(90632),
    areaData: [
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: [
          ...series('', 50),
          ...series('Female', 20, 2023),
          ...series('Male', 40, 2022),
          point(28, [
            sex('Female'),
            { type: 'Disability', value: 'Disabled', dimensionClass: 'inequality', sortOrder: 1 },
          ]),
        ],
      },
    ],
  };
}
