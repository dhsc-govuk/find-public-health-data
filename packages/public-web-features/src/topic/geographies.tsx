import {
  Button,
  CollapsibleFilterCard,
  FilterChip,
  FilterChips,
  GeographyTree,
  Radios,
} from '@fphd/ui';
import { useEffect, useState } from 'react';
import { Form, useLocation, useNavigate, useNavigation } from 'react-router';
import { HiddenFilters } from '../search/filter-fields.tsx';
import { SearchGeographyPicker } from '../search/geography-picker.tsx';
import type { loadSearch } from '../search/loader.ts';
import { TOPIC_AREA_GROUPS } from './data.ts';

type Search = Awaited<ReturnType<typeof loadSearch>>;

export function TopicGeographies({
  search,
  path,
  tab,
}: {
  search: Search;
  path: string;
  tab: 'overview' | 'data' | 'areas';
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();
  const params = new URLSearchParams(
    navigation.location?.pathname === location.pathname
      ? navigation.location.search
      : location.search,
  );
  const extraParams = {
    ...Object.fromEntries(
      [...params].filter(([key]) => key === 'sort' || key === 'columns-topic' || key === 'render'),
    ),
    'tab-topic': tab,
  };
  const urlFor = (gaCodes: string[], geoLevels: string[]) => {
    const next = new URLSearchParams(params);
    next.delete('ga');
    next.delete('geo');
    next.delete('page');
    next.set('tab-topic', tab);
    for (const code of gaCodes) next.append('ga', code);
    for (const level of geoLevels) next.append('geo', level);
    return `${path}?${next}`;
  };
  const action = `${path}#${tab === 'areas' ? 'topic-area-summaries' : `topic-${tab}`}`;
  const picked = search.gaCodes.length > 0 || search.geoLevels.length > 0;
  const requestedGroup = TOPIC_AREA_GROUPS.includes(params.get('geo') ?? '')
    ? (params.get('geo') ?? 'NHS regions')
    : 'NHS regions';
  const codesKey = params.getAll('ga').join(',');
  const [selectedGroup, setSelectedGroup] = useState(requestedGroup);
  useEffect(() => setSelectedGroup(requestedGroup), [requestedGroup]);
  const [selectedCodes, setSelectedCodes] = useState(params.getAll('ga'));
  useEffect(() => setSelectedCodes(codesKey ? codesKey.split(',') : []), [codesKey]);
  if (tab === 'areas') {
    return (
      <div className="fphd-topic-geographies">
        <h2 className="govuk-heading-m">Geographies</h2>
        <CollapsibleFilterCard
          active
          variant="accordion"
          headingLevel={3}
          title="Type of geography"
        >
          <Form action={action} method="get" preventScrollReset>
            <HiddenFilters
              state={search}
              extraParams={extraParams}
              except={['geoLevels', 'gaCodes']}
            />
            <Radios
              id="topic-area-type"
              name="geo"
              label="Type of geography"
              hint="Choose which geographies to show in the table"
              classModifiers="small"
              onChange={(event) => {
                setSelectedGroup(event.currentTarget.value);
                setSelectedCodes([]);
                void navigate(urlFor([], [event.currentTarget.value]), {
                  preventScrollReset: true,
                });
              }}
              options={TOPIC_AREA_GROUPS.filter((group) =>
                search.displayGroups.includes(group),
              ).map((group) => ({
                value: group,
                label:
                  group === 'Local authorities'
                    ? 'Upper-tier local authorities'
                    : group === 'Integrated care boards'
                      ? 'Integrated care boards (ICBs)'
                      : group,
                checked: selectedGroup === group,
              }))}
            />
            <GeographyTree
              key={selectedGroup}
              flat
              name="ga"
              levels={[selectedGroup]}
              selected={selectedCodes}
              selectedLevels={[]}
              searchLabel="Search for a geography (optional)"
              searchHint="Choose one or more to compare with England"
              fallback={search.geographyOptions}
              onLevelsChange={() => {}}
              onChange={(codes) => {
                setSelectedCodes(codes);
                void navigate(urlFor(codes, [selectedGroup]), {
                  preventScrollReset: true,
                });
              }}
            />
            <noscript>
              <Button type="submit">Apply geographies</Button>
            </noscript>
          </Form>
        </CollapsibleFilterCard>
      </div>
    );
  }
  return (
    <div className="fphd-topic-geographies">
      <h2 className="govuk-heading-m">Geographies</h2>
      <CollapsibleFilterCard
        active
        variant="accordion"
        headingLevel={3}
        title="Geographies"
        onClear={picked ? urlFor([], []) : undefined}
        footer={
          <SearchGeographyPicker
            autoApply
            lookupUrl="/geographies?scheme=public"
            single={tab === 'overview'}
            action={action}
            extraParams={extraParams}
            state={search}
            displayGroups={search.displayGroups}
            geographyOptions={search.geographyOptions}
            onApply={({ gaCodes, geoLevels }) =>
              void navigate(urlFor(gaCodes, geoLevels), {
                preventScrollReset: true,
                flushSync: true,
              })
            }
          />
        }
      >
        {tab === 'overview' ? (
          <>
            <p className="govuk-body govuk-!-font-weight-bold govuk-!-margin-bottom-1">
              Showing figures for
            </p>
            <FilterChips>
              <FilterChip value={search.gaCodes[0] ?? 'E92000001'}>
                {search.gaAreaNames[search.gaCodes[0] ?? ''] ?? 'England'}
              </FilterChip>
            </FilterChips>
          </>
        ) : null}
      </CollapsibleFilterCard>
    </div>
  );
}
