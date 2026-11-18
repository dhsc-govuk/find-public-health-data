import { INDICATOR_SEARCH_MAX_LENGTH } from '@fphd/internal-api-features/contract';
import { Button, Input, Label } from '@fphd/ui';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { DASHBOARD_PATH, dashboardPath } from './paths.ts';

const LABEL = 'Search indicators by name or who created them';

/**
 * The dashboard's search, which narrows every list on it. A search sends the open tab with it,
 * so the user stays on that tab. It sends no page, so the results start on the first page.
 * Clear search does the same with no search, which returns every list to all its indicators.
 */
export function DashboardSearch({ search }: { search: string | undefined }) {
  const tab = new URLSearchParams(useLocation().search).get('tab');
  const [reset, setReset] = useState(0);

  return (
    // biome-ignore lint/a11y/noRedundantRoles: Explicit landmark supports browsers predating the search element.
    <search role="search" className="govuk-!-margin-bottom-6">
      <form action={DASHBOARD_PATH} className="fphd-inline-search" method="get">
        {tab === null ? null : <input name="tab" type="hidden" value={tab} />}
        <Label className="govuk-visually-hidden" htmlFor="dashboard-search">
          {LABEL}
        </Label>
        <Input
          autoComplete="off"
          className="fphd-inline-search__input"
          defaultValue={search}
          id="dashboard-search"
          // A new search replaces the input, so its value follows the address after navigation.
          // Clear search replaces it too, which empties text typed but never searched for.
          key={`${search ?? ''}-${reset}`}
          maxLength={INDICATOR_SEARCH_MAX_LENGTH}
          name="search"
          placeholder={LABEL}
          type="search"
        />
        <Button className="govuk-!-margin-bottom-0" type="submit">
          Search
        </Button>
        <Link
          className="govuk-link govuk-body-s govuk-!-margin-bottom-0 fphd-inline-search__clear"
          onClick={() => setReset((value) => value + 1)}
          preventScrollReset
          to={dashboardPath(1, tab ?? undefined)}
        >
          Clear search
        </Link>
      </form>
    </search>
  );
}
