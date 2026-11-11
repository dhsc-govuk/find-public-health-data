import { Autocomplete, Button } from '@fphd/ui';
import { useCallback } from 'react';
import { Form, Link, useLocation, useNavigate } from 'react-router';
import type { IndicatorSummary } from './loader.ts';

export function ComparePicker({
  name,
  slug,
  compared,
  findSubject,
  findResults,
}: {
  name: string;
  slug: string;
  compared?: { name: string; slug: string } | undefined;
  findSubject: string;
  findResults: IndicatorSummary[];
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const urlFor = (slug: string | null, hash = '') => {
    const params = new URLSearchParams(location.search);
    params.delete('find');
    if (slug) params.set('compareWith', slug);
    else params.delete('compareWith');
    params.set('tab-indicator', 'compare');
    return `${location.pathname}?${params}${hash}`;
  };
  const searchIndicators = useCallback(
    async (query: string, signal: AbortSignal) => {
      const response = await fetch(`/indicators/search?q=${encodeURIComponent(query)}`, { signal });
      if (!response.ok) throw new Error(`Indicator search failed: ${response.status}`);
      const { indicators } = (await response.json()) as { indicators: IndicatorSummary[] };
      return indicators
        .filter((indicator) => indicator.slug !== slug)
        .map(({ name, slug }) => ({ value: slug, label: name }));
    },
    [slug],
  );

  return (
    <>
      <p className="govuk-body">
        Choose another indicator to compare with "{name}" in a scatter chart.
      </p>
      <Form
        className="fphd-compare-search"
        action={`${location.pathname}#indicator-compare-indicators`}
        method="get"
        preventScrollReset
      >
        {[...new URLSearchParams(location.search)]
          .filter(([key]) => key !== 'find' && key !== 'compareWith' && key !== 'tab-indicator')
          .map(([key, value], index) => (
            <input key={`${key}-${index}`} name={key} type="hidden" value={value} />
          ))}
        <input type="hidden" name="tab-indicator" value="compare" />
        <Autocomplete
          defaultValue={compared?.name ?? findSubject}
          label="Search for an indicator"
          name="find"
          source={searchIndicators}
          onSelect={(option) => {
            void navigate(urlFor(option.value), { preventScrollReset: true });
          }}
        />
        {compared ? (
          <Link
            className="govuk-link fphd-compare-search__clear"
            to={urlFor(null)}
            preventScrollReset
          >
            Clear search
          </Link>
        ) : null}
        <noscript>
          <Button type="submit">Search</Button>
        </noscript>
      </Form>
      {findSubject ? (
        <ul className="govuk-list">
          {findResults.map((result) => (
            <li key={result.slug}>
              <Link
                className="govuk-link"
                to={urlFor(result.slug, '#indicator-compare-indicators')}
                preventScrollReset
              >
                {result.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
