import { CollapsibleFilterCard, FilterChip, FilterChips } from '@fphd/ui';
import { useNavigate } from 'react-router';
import { MAX_SELECTED_AREAS } from '../selection-limits.ts';
import { SearchGeographyPicker } from './geography-picker.tsx';
import type { loadSearch } from './loader.ts';
import { searchUrl } from './url.ts';

export function SearchGeographies({
  search,
  path = '/search',
  extraParams = {},
  single = false,
  replace = false,
  lookupUrl = '/geographies?scheme=public',
}: {
  search: Awaited<ReturnType<typeof loadSearch>>;
  path?: string;
  extraParams?: Record<string, string>;
  single?: boolean;
  replace?: boolean;
  lookupUrl?: string;
}) {
  const navigate = useNavigate();
  const picked = search.gaCodes.length > 0 || search.geoLevels.length > 0;
  const urlFor = (gaCodes: string[], geoLevels: string[]) =>
    searchUrl({ ...search, gaCodes, geoLevels }, path, extraParams);
  return (
    <div className="fphd-topic-geographies">
      <h2 className="govuk-heading-m">Geographies</h2>
      <CollapsibleFilterCard
        active
        headingLevel={3}
        title="Geographies"
        onClear={picked ? urlFor([], []) : undefined}
        footer={
          <SearchGeographyPicker
            lookupUrl={lookupUrl}
            single={single}
            action={path}
            extraParams={extraParams}
            state={search}
            displayGroups={search.displayGroups}
            geographyOptions={search.geographyOptions}
            onApply={({ gaCodes, geoLevels }) =>
              void navigate(urlFor(gaCodes, geoLevels), { preventScrollReset: true, replace })
            }
          />
        }
      >
        {search.areasLimited ? (
          <p className="govuk-body-s">
            You can select up to {MAX_SELECTED_AREAS} areas. Only the first {MAX_SELECTED_AREAS}{' '}
            have been selected.
          </p>
        ) : null}
        {single ? (
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
