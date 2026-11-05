export interface SearchState {
  q: string;
  topics: string[];
  indicatorTypes: string[];
  lifeStages: string[];
  frameworks: string[];
  populations: string[];
  inequalities: string[];
  sources: string[];
  valueTypes: string[];
  yearTypes: string[];
  geoLevels: string[];
  gaCodes: string[];
  fromYear?: string;
  toYear?: string;
  updatedWithin?: string;
  subtopics?: string[];
}

export const PERIOD_PARAMS = ['fromYear', 'toYear', 'updatedWithin'] as const;

export interface DimensionConfig {
  param: string;
  stateKey: keyof SearchState;
  label: string;
  classificationDimension?: string;
  isTopicDimension?: boolean;
  valueIsLabel?: boolean;
}

export const DIMENSIONS: DimensionConfig[] = [
  {
    param: 't',
    stateKey: 'topics',
    label: 'Topics',
    isTopicDimension: true,
  },
  {
    param: 'it',
    stateKey: 'indicatorTypes',
    label: 'Measure types',
    classificationDimension: 'indicator_type',
  },
  {
    param: 'ls',
    stateKey: 'lifeStages',
    label: 'Life stages',
    classificationDimension: 'life_stage',
  },
  {
    param: 'fw',
    stateKey: 'frameworks',
    label: 'Frameworks',
    classificationDimension: 'framework',
  },
  {
    param: 'pg',
    stateKey: 'populations',
    label: 'Population groups',
    classificationDimension: 'population',
  },
  {
    param: 'eq',
    stateKey: 'inequalities',
    label: 'Inequality categories',
    classificationDimension: 'inequality',
  },
  {
    param: 'src',
    stateKey: 'sources',
    label: 'Data sources',
    valueIsLabel: true,
  },
  {
    param: 'vt',
    stateKey: 'valueTypes',
    label: 'Value types',
    valueIsLabel: true,
  },
  {
    param: 'per',
    stateKey: 'yearTypes',
    label: 'Reporting periods',
    valueIsLabel: true,
  },
];

/**
 * The nine filter dimensions and the two geography fields, in URL order. Sharing the list
 * keeps generated URLs and hidden form fields in sync.
 */
export const LIST_PARAMS: { param: string; stateKey: keyof SearchState }[] = [
  ...DIMENSIONS.map(({ param, stateKey }) => ({ param, stateKey })),
  { param: 'geo', stateKey: 'geoLevels' },
  { param: 'ga', stateKey: 'gaCodes' },
];

export function searchUrl(
  state: SearchState,
  path = '/search',
  extraParams: Record<string, string> = {},
): string {
  const p = new URLSearchParams(extraParams);
  if (state.q) p.set('q', state.q);
  for (const subtopic of state.subtopics ?? []) p.append('subtopic', subtopic);
  for (const key of PERIOD_PARAMS) if (state[key]) p.set(key, state[key]);
  for (const { param, stateKey } of LIST_PARAMS) {
    for (const v of state[stateKey] as string[]) p.append(param, v);
  }
  const s = p.toString();
  return `${path}${s ? `?${s}` : ''}`;
}

export const EMPTY_SEARCH_STATE: SearchState = {
  q: '',
  topics: [],
  indicatorTypes: [],
  lifeStages: [],
  frameworks: [],
  populations: [],
  inequalities: [],
  sources: [],
  valueTypes: [],
  yearTypes: [],
  geoLevels: [],
  gaCodes: [],
};
