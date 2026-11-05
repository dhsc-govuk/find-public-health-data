import { type AutocompleteOption, CollapsibleFilterCard } from '@fphd/ui';
import { type ReactNode, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { FilterDimensionChoices } from './filter-fields.tsx';
import type { IndicatorFacets } from './loader.ts';
import { SearchPeriodFilter } from './period-filter.tsx';
import { DIMENSIONS, EMPTY_SEARCH_STATE, type SearchState, searchUrl } from './url.ts';

interface SearchFilterPaneProps {
  action?: string;
  extraParams?: Record<string, string>;
  includeTopics?: boolean;
  includeDataPeriod?: boolean;
  compact?: boolean;
  subtopicFilter?: ReactNode;
  state: SearchState;
  facets: IndicatorFacets;
}

export function SearchFilterPane({
  action = '/search',
  extraParams = {},
  includeTopics = true,
  includeDataPeriod = false,
  compact = false,
  subtopicFilter,
  state,
  facets,
}: SearchFilterPaneProps) {
  const urlFor = (next: SearchState) => searchUrl(next, action, extraParams);
  const navigate = useNavigate();
  const pendingState = useRef(state);
  const committedState = useRef(state);
  if (committedState.current !== state) {
    committedState.current = state;
    pendingState.current = state;
  }
  const nav = (next: SearchState) => {
    pendingState.current = next;
    void navigate(urlFor(next), { replace: true, preventScrollReset: true });
  };

  const optionsForDimension = (dim: (typeof DIMENSIONS)[number]): AutocompleteOption[] => {
    if (dim.isTopicDimension) {
      return facets.topics.map((topic) => ({ value: topic.slug, label: topic.title }));
    }
    if (dim.classificationDimension) {
      return facets.classifications
        .filter((entry) => entry.dimension === dim.classificationDimension)
        .map((entry) => ({ value: entry.slug, label: entry.name }));
    }
    if (dim.stateKey === 'sources') return facets.sources.map((value) => ({ value, label: value }));
    if (dim.stateKey === 'valueTypes')
      return facets.valueTypes.map((value) => ({ value, label: value }));
    if (dim.stateKey === 'yearTypes')
      return facets.yearTypes.map((value) => ({ value, label: value }));
    return [];
  };

  const topicsActive =
    Boolean(state.subtopics?.length) ||
    state.topics.length > 0 ||
    state.indicatorTypes.length > 0 ||
    state.lifeStages.length > 0;
  const popActive = state.populations.length > 0 || state.inequalities.length > 0;
  const dataAttrActive =
    state.sources.length > 0 || state.valueTypes.length > 0 || state.yearTypes.length > 0;
  const topicsAndTypesDims = DIMENSIONS.filter(
    (dim) => ['t', 'it', 'ls'].includes(dim.param) && (includeTopics || dim.param !== 't'),
  );
  const fwDims = DIMENSIONS.filter((dim) => dim.param === 'fw');
  const popDims = DIMENSIONS.filter((dim) => ['pg', 'eq'].includes(dim.param));
  const dataDims = DIMENSIONS.filter((dim) => ['src', 'vt', 'per'].includes(dim.param));
  const choices = (dim: (typeof DIMENSIONS)[number]) => (
    <FilterDimensionChoices
      key={dim.param}
      action={action}
      extraParams={extraParams}
      label={dim.label}
      options={optionsForDimension(dim)}
      param={dim.param}
      state={state}
      stateKey={dim.stateKey}
      onChange={(values) => nav({ ...pendingState.current, [dim.stateKey]: values })}
    />
  );

  return (
    <div className="fphd-topic-indicator-filters">
      <div className="fphd-search-bar__filters-row">
        <h2 className="govuk-heading-m govuk-!-margin-bottom-0">Indicator filters</h2>
        <Link
          className="govuk-link govuk-body-s"
          preventScrollReset
          replace
          to={urlFor({ ...EMPTY_SEARCH_STATE, q: state.q })}
        >
          Clear all filters
        </Link>
      </div>
      <CollapsibleFilterCard
        active={topicsActive}
        footer={
          <>
            {subtopicFilter}
            {topicsAndTypesDims.map(choices)}
          </>
        }
        onClear={urlFor({
          ...state,
          subtopics: [],
          topics: [],
          indicatorTypes: [],
          lifeStages: [],
        })}
        title={includeTopics ? 'Topics and types' : 'Subtopics and types'}
      />
      <CollapsibleFilterCard
        active={state.frameworks.length > 0}
        footer={fwDims.map(choices)}
        hint="Established frameworks used to group or report indicators."
        onClear={urlFor({ ...state, frameworks: [] })}
        title="Frameworks and programmes"
      />
      {!compact ? (
        <>
          {popActive || popDims.some((dim) => optionsForDimension(dim).length > 0) ? (
            <CollapsibleFilterCard
              active={popActive}
              footer={popDims.map(choices)}
              onClear={urlFor({ ...state, populations: [], inequalities: [] })}
              title="Populations and inequalities"
            />
          ) : null}
          <CollapsibleFilterCard
            active={dataAttrActive}
            footer={dataDims.map(choices)}
            onClear={urlFor({ ...state, sources: [], valueTypes: [], yearTypes: [] })}
            title="About the data"
          />
          {includeDataPeriod ? (
            <>
              <CollapsibleFilterCard active={false} title="Status">
                <p className="govuk-body-s">
                  Release status information is not available for this dataset.
                </p>
              </CollapsibleFilterCard>
              <SearchPeriodFilter
                key={JSON.stringify([state.fromYear, state.toYear, state.updatedWithin])}
                action={action}
                extraParams={extraParams}
                state={state}
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
