import type { AreaWithParent } from '@fphd/public-api-features/contract';
import { Button, CollapsibleFilterCard, GeographyTree, Select } from '@fphd/ui';
import { Form, useLocation, useNavigate, useNavigation } from 'react-router';
import { geographyGroupLabel } from '../geography/groups.ts';
import { areaColourMode, areaComparisonRegions, highlightedAreaCodes } from './area-comparison.ts';

function useAreaParams(anchor: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const params = new URLSearchParams(
    navigation.location?.pathname === location.pathname
      ? navigation.location.search
      : location.search,
  );
  const action = `${location.pathname}#${anchor}`;
  const update = (key: string, value: string | string[]) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    // Region ticks are folded into the highlight list, so a later untick is not undone.
    if (key === 'highlight') next.delete('highlightRegion');
    for (const entry of Array.isArray(value) ? value : [value]) if (entry) next.append(key, entry);
    void navigate(
      { search: `?${next}` },
      { replace: true, preventScrollReset: true, flushSync: true },
    );
  };
  const hidden = (excluding: string[]) =>
    [...params]
      .filter(([key]) => !excluding.includes(key))
      .map(([key, value], index) => (
        <input key={`${key}-${index}`} name={key} type="hidden" value={value} />
      ));
  return { params, action, update, hidden };
}

export function AreaSortControl() {
  const { params, action, update, hidden } = useAreaParams('indicator-compare-areas');
  return (
    <Form method="get" action={action} className="fphd-area-sort">
      {hidden(['areaSort'])}
      <Select
        id="compare-area-sort"
        name="areaSort"
        label="Sort by:"
        value={params.get('areaSort') ?? 'descending'}
        options={[
          { label: 'Highest to lowest', value: 'descending' },
          { label: 'Lowest to highest', value: 'ascending' },
          { label: 'Alphabetical', value: 'alphabetical' },
        ]}
        onChange={(event) => update('areaSort', event.currentTarget.value)}
      />
      <noscript>
        <Button type="submit">Sort</Button>
      </noscript>
    </Form>
  );
}

export function AreaControls({
  slug,
  group,
  groups,
  areas,
  displayOptions = true,
}: {
  slug: string;
  group: string;
  groups: string[];
  areas: AreaWithParent[];
  displayOptions?: boolean;
}) {
  const { params, action, update, hidden } = useAreaParams(
    displayOptions ? 'indicator-compare-areas' : 'indicator-compare-indicators',
  );
  const highlighted = highlightedAreaCodes(params, areas);
  const regions = areaComparisonRegions(areas);
  const search = params.get('geo-q')?.trim() ?? '';
  const matches = search
    ? areas.filter(({ name }) => name.toLowerCase().includes(search.toLowerCase()))
    : areas;
  return (
    <>
      <h2 className="govuk-heading-m">Geographies</h2>
      <CollapsibleFilterCard active headingLevel={3} title="Geographies">
        <Form method="get" action={action}>
          {hidden(['areaType', 'highlight', 'highlightRegion', 'geo-q'])}
          <Select
            id={displayOptions ? 'compare-area-type' : 'pair-area-type'}
            name="areaType"
            label="Type of geography"
            value={params.get('areaType') ?? group}
            options={groups.map((value) => ({ value, label: value }))}
            onChange={(event) => update('areaType', event.currentTarget.value)}
          />
          <noscript>
            <Button type="submit">Change geography type</Button>
          </noscript>
        </Form>
        <Form method="get" action={action}>
          {hidden(['geo-q', 'highlight', 'highlightRegion'])}
          <GeographyTree
            key={group}
            flat
            name="highlight"
            levels={[group]}
            selected={highlighted}
            selectedLevels={[]}
            regions={regions}
            regionName="highlightRegion"
            regionAreasNoun={
              group === 'Local authorities'
                ? 'upper tier local authorities'
                : geographyGroupLabel(group)
            }
            searchLabel={`Highlight ${geographyGroupLabel(group)}`}
            searchHint="Search areas"
            lookupUrl={`/geographies?indicator=${encodeURIComponent(slug)}&displayGroup=${encodeURIComponent(group)}`}
            fallback={{
              query: search,
              level: '',
              groups: search ? [{ name: group, areas: matches }] : [],
              previews: [{ name: group, areas }],
              error: false,
            }}
            onChange={(codes) => update('highlight', codes)}
            onLevelsChange={() => {}}
          />
          <noscript>
            <Button type="submit">Apply highlights</Button>
          </noscript>
        </Form>
      </CollapsibleFilterCard>
      {displayOptions ? (
        <>
          <h2 className="govuk-heading-m">Display options</h2>
          <CollapsibleFilterCard active headingLevel={3} title="Table and map options">
            <Form method="get" action={action}>
              {hidden(['areaColour'])}
              <Select
                id="compare-area-colour"
                name="areaColour"
                label="Colour geographies by"
                value={areaColourMode(params.get('areaColour'))}
                options={[
                  { label: 'Compared with England', value: 'england' },
                  { label: '5 equal groups (quintiles)', value: 'quintiles' },
                ]}
                onChange={(event) => update('areaColour', event.currentTarget.value)}
              />
              <noscript>
                <Button type="submit">Apply display options</Button>
              </noscript>
            </Form>
          </CollapsibleFilterCard>
        </>
      ) : null}
    </>
  );
}
