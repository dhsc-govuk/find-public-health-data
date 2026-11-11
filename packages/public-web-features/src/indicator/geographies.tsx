import { CollapsibleFilterCard } from '@fphd/ui';
import { useLocation, useNavigate } from 'react-router';
import type { GeographyOptions } from '../geography/loader.ts';
import { GeographyPicker } from '../geography/picker.tsx';
import type { IndicatorSelection } from './loader.ts';
import { indicatorSelectionUrl } from './paths.ts';

export function IndicatorGeographies({
  displayGroups,
  geographyOptions,
  slug,
  selection,
}: {
  displayGroups: string[];
  geographyOptions?: GeographyOptions | undefined;
  slug: string;
  selection: IndicatorSelection;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const urlFor = (areaCodes: string[], areaLevels: string[]) =>
    indicatorSelectionUrl(location, areaCodes, areaLevels);
  const picked = selection.areaCodes.length > 0 || selection.areaLevels.length > 0;

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
          lookupUrl={`/geographies?indicator=${encodeURIComponent(slug)}&scheme=public`}
          searchLabel="Search for a geography"
          searchHint="Search by name, for example Leeds"
          action={`${location.pathname}#indicator-data`}
          displayGroups={displayGroups}
          geographyOptions={geographyOptions}
          levelName="als"
          name="as"
          onApply={({ areaCodes, areaLevels }) => {
            void navigate(urlFor(areaCodes, areaLevels), { preventScrollReset: true });
          }}
          selection={selection}
        >
          {[...params]
            .filter(([name]) => name !== 'as' && name !== 'als' && name !== 'find')
            .map(([name, value], index) => (
              <input key={`${name}-${index}`} name={name} type="hidden" value={value} />
            ))}
        </GeographyPicker>
      </CollapsibleFilterCard>
    </div>
  );
}
