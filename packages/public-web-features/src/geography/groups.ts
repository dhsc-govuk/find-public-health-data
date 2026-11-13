/** Public navigation separates the two local-authority tiers in the shared catalogue. */
const GROUPS = [
  { name: 'Integrated care boards (ICBs)', source: 'Integrated care boards' },
  { name: 'Upper-tier local authorities', source: 'Local authorities' },
  { name: 'Lower-tier local authorities', source: 'Local authorities' },
  { name: 'Middle layer super output areas (MSOAs)', source: 'Middle-layer super output areas' },
  { name: 'NHS regions', source: 'NHS regions' },
  { name: 'Statistical regions', source: 'Statistical regions' },
] as const;

export function sourceGeographyGroup(name: string): string {
  return GROUPS.find((group) => group.name === name)?.source ?? name;
}

export function publicGeographyLevels(sources: string[]): string[] {
  return GROUPS.filter((group) => sources.includes(group.source)).map((group) => group.name);
}

export function normalizePublicLevels(levels: string[]): string[] {
  return [
    ...new Set(
      levels.flatMap((level) =>
        GROUPS.filter((group) => group.name === level || group.source === level).map(
          (group) => group.name,
        ),
      ),
    ),
  ];
}

export function areasInGeographyGroup<T extends { code: string }>(areas: T[], name: string): T[] {
  // GSS E06: unitary authorities, E08: metropolitan districts, E09: London boroughs,
  // E10: counties; the lower tier combines E07 districts with the unitary authorities.
  if (name === 'Upper-tier local authorities')
    return areas.filter(({ code }) => /^E(?:06|08|09|10)\d{6}$/.test(code));
  if (name === 'Lower-tier local authorities')
    return areas.filter(({ code }) => /^E(?:06|07|08|09)\d{6}$/.test(code));
  return areas;
}

export function publicGeographyGroups<T extends { code: string; name: string }>(
  groups: { name: string; areas: T[] }[],
) {
  return publicGeographyLevels(groups.map((group) => group.name)).map((name) => ({
    name,
    areas: areasInGeographyGroup(
      groups
        .filter((group) => group.name === sourceGeographyGroup(name))
        .flatMap((group) => group.areas),
      name,
    ),
  }));
}

export function geographyGroupLabel(group: string): string {
  const acronyms: Record<string, string> = { nhs: 'NHS', icbs: 'ICBs', msoas: 'MSOAs' };
  return group.toLowerCase().replace(/\b(nhs|icbs|msoas)\b/g, (word) => acronyms[word] ?? word);
}

const SINGLE_AREA_TYPES: Record<string, string> = {
  'Integrated care boards': 'Integrated care board',
  'Middle-layer super output areas': 'Middle-layer super output area',
  'NHS regions': 'NHS region',
  'Statistical regions': 'Statistical region',
  'GP practices': 'GP practice',
};

export function areaTypeLabel(group: string, code: string): string {
  if (group === 'Local authorities') {
    if (/^E10/.test(code)) return 'Upper tier local authority';
    if (/^E07/.test(code)) return 'Lower tier local authority';
    if (/^E(?:06|08|09)/.test(code)) return 'Upper and lower tier local authority';
    return 'Local authority';
  }
  return SINGLE_AREA_TYPES[group] ?? group;
}
