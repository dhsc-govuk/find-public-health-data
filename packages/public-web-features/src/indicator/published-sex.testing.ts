import { indicatorDetail, observation, sex } from './view.testing.ts';

export function publishedSexFixture(shortId: 92443 | 93622) {
  const ages = shortId === 92443 ? ['18+ yrs'] : ['All ages', '<18 yrs'];
  const age = (value: string) =>
    value === 'All ages'
      ? []
      : [{ type: 'Age', value, dimensionClass: 'core' as const, sortOrder: 1 }];
  const unpublishedAge = shortId === 92443 ? '65+ yrs' : '25-64 yrs';
  return {
    detail: indicatorDetail(shortId, {
      publishedGroupings: ages.flatMap((age) =>
        (shortId === 92443 ? [1, 3] : [1]).map((yearRange) => ({
          sex: null,
          age,
          yearRange,
          periodKind: 'annual' as const,
        })),
      ),
    }),
    areaData: [
      {
        areaCode: 'E92000001',
        areaName: 'England',
        observations: [
          ...ages.map((value) => observation(12, age(value))),
          observation(99, age(unpublishedAge)),
          ...['Female', 'Male'].flatMap((value) => [
            ...ages.map((label) => observation(88, [...age(label), sex(value)])),
            ...(shortId === 92443 ? [observation(77, [...age(unpublishedAge), sex(value)])] : []),
          ]),
        ],
      },
    ],
  };
}
