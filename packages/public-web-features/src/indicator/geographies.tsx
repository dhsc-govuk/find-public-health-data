import { CollapsibleFilterCard } from '@fphd/ui';
import type { ReactNode } from 'react';
import { useLocation, useNavigate, useNavigation } from 'react-router';
import { normalizePublicLevels } from '../geography/groups.ts';
import type { GeographyOptions } from '../geography/loader.ts';
import { GeographyPicker } from '../geography/picker.tsx';
import { MAX_SELECTED_AREAS } from '../selection-limits.ts';
import { useIndicatorLinks } from './links.ts';
import type { IndicatorSelection } from './loader.ts';
import { indicatorSelectionUrl, requestedAreaCodes, requestedAreaLevels } from './paths.ts';

export function IndicatorGeographies({
  children,
  shortId,
  displayGroups,
  geographyOptions,
  slug,
  selection,
}: {
  children?: ReactNode;
  shortId: number;
  displayGroups: string[];
  geographyOptions?: GeographyOptions | undefined;
  slug: string;
  selection: IndicatorSelection;
}) {
  const location = useLocation();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const links = useIndicatorLinks();
  const currentLocation = navigation.location ?? location;
  const params = new URLSearchParams(currentLocation.search);
  const urlFor = (areaCodes: string[], areaLevels: string[]) =>
    indicatorSelectionUrl(currentLocation, areaCodes, areaLevels, shortId);
  const currentSelection = {
    ...selection,
    areaCodes: requestedAreaCodes(params).slice(0, MAX_SELECTED_AREAS),
    areaLevels: normalizePublicLevels(requestedAreaLevels(params)).filter((level) =>
      displayGroups.includes(level),
    ),
  };
  const picked = currentSelection.areaCodes.length > 0 || currentSelection.areaLevels.length > 0;

  return (
    <div className="fphd-indicator-geographies">
      <h2 className="govuk-heading-m">Geographies</h2>
      <CollapsibleFilterCard
        active
        headingLevel={3}
        title="Geographies"
        onClear={picked ? urlFor([], []) : undefined}
      >
        <GeographyPicker
          lookupUrl={`${links.geographies}?indicator=${encodeURIComponent(slug)}&scheme=public`}
          searchLabel="Search for a geography"
          searchHint="Search by name, for example Leeds"
          action={`${location.pathname}#indicator-data`}
          displayGroups={displayGroups}
          geographyOptions={geographyOptions}
          levelName="als"
          name="as"
          choicesLabel="Geography choices for Indicator"
          onApply={({ areaCodes, areaLevels }) => {
            void navigate(urlFor(areaCodes, areaLevels), { preventScrollReset: true });
          }}
          selection={currentSelection}
        >
          {!picked && !params.has(`cmp-${shortId}`) ? (
            <input name={`cmp-${shortId}`} type="hidden" value="england" />
          ) : null}
          {[...params]
            .filter(([name]) => name !== 'as' && name !== 'als' && name !== 'find')
            .map(([name, value], index) => (
              <input key={`${name}-${index}`} name={name} type="hidden" value={value} />
            ))}
        </GeographyPicker>
      </CollapsibleFilterCard>
      {children}
    </div>
  );
}
