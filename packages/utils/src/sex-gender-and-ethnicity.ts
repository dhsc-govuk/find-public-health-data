/** What a publisher can say was collected for an indicator. Each asks which ones are included. */
export const DEMOGRAPHICS = ['sex', 'gender', 'ethnicity'] as const;

export type Demographic = (typeof DEMOGRAPHICS)[number];

export const DEMOGRAPHIC_LABELS: Readonly<Record<Demographic, string>> = {
  sex: 'Sex',
  gender: 'Gender',
  ethnicity: 'Ethnicity',
};

/** The sexes an indicator can cover: persons is everyone, whatever their sex. */
export const SEXES = ['persons', 'females', 'males'] as const;

export type Sex = (typeof SEXES)[number];

export const SEX_LABELS: Readonly<Record<Sex, string>> = {
  persons: 'Person',
  females: 'Female',
  males: 'Male',
};

/** The genders an indicator can cover: persons is everyone, whatever their gender. */
export const GENDERS = [
  'persons',
  'women-and-girls',
  'men-and-boys',
  'non-binary',
  'other',
  'prefer-not-to-say',
] as const;

export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Readonly<Record<Gender, string>> = {
  persons: 'Person',
  'women-and-girls': 'Woman or girl',
  'men-and-boys': 'Man or boy',
  'non-binary': 'Non-binary',
  other: 'Other',
  'prefer-not-to-say': 'Prefer not to say',
};

/**
 * The ethnic groups an indicator can cover. This is a fixed list for the indicator's metadata,
 * separate from the ethnicity schemes the data table's reference data holds.
 */
export const ETHNIC_GROUPS = ['asian', 'black', 'mixed', 'white', 'other'] as const;

export type EthnicGroup = (typeof ETHNIC_GROUPS)[number];

export const ETHNIC_GROUP_LABELS: Readonly<Record<EthnicGroup, string>> = {
  asian: 'Asian, Asian British or Asian Welsh',
  black: 'Black, Black British, Black Welsh, Caribbean or African',
  mixed: 'Mixed or Multiple ethnic groups',
  white: 'White',
  other: 'Other ethnic group',
};
