import { SearchField } from '@fphd/ui';
import { useState } from 'react';
import { Form, Link } from 'react-router';
import { HiddenFilters } from './filter-fields.tsx';
import { type SearchState, searchUrl } from './url.ts';

export function SearchKeywords({
  state,
  extraParams,
}: {
  state: SearchState;
  extraParams: Record<string, string>;
}) {
  const [reset, setReset] = useState(0);
  return (
    <Form action="/search" method="get" replace>
      <HiddenFilters except="q" state={state} extraParams={extraParams} />
      <SearchField
        key={`${state.q}-${reset}`}
        action={
          <Link
            className="govuk-link govuk-body-s"
            onClick={() => setReset((value) => value + 1)}
            preventScrollReset
            replace
            to={searchUrl({ ...state, q: '' }, '/search', extraParams)}
          >
            Clear search
          </Link>
        }
        id="search-q"
        label="Search by keywords"
        name="q"
        defaultValue={state.q}
      />
    </Form>
  );
}
