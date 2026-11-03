import {
  type AutocompleteOption,
  CollapsibleFilterCard,
  FilterChip,
  FilterChips,
  SearchField,
} from '@fphd/ui';
import { type ReactNode, useRef, useState } from 'react';
import { Form, Link, useLocation, useNavigate } from 'react-router';
import type { GeographyOptions } from '../geography/loader.ts';
import { MAX_SELECTED_AREAS } from '../selection-limits.ts';
import {
  FilterDimensionBody,
  FilterDimensionChoices,
  FilterDimensionFooter,
  HiddenFilters,
} from './filter-fields.tsx';
import { SearchGeographyPicker } from './geography-picker.tsx';
import type { IndicatorFacets } from './loader.ts';
import { SearchPeriodFilter } from './period-filter.tsx';
import { DIMENSIONS, EMPTY_SEARCH_STATE, removeFrom, type SearchState, searchUrl } from './url.ts';

interface SearchFilterPaneProps {
  action?: string;
  formAction?: string;
  extraParams?: Record<string, string>;
  includeTopics?: boolean;
  includeDataPeriod?: boolean;
  includeGeography?: boolean;
  includeSearch?: boolean;
  variant?: 'card' | 'accordion';
  compact?: boolean;
  additionalFilters?: ReactNode;
  subtopicFilter?: ReactNode;
  state: SearchState;
  facets: IndicatorFacets;
  displayGroups: string[];
  gaAreaNames: Record<string, string>;
  geographyOptions?: GeographyOptions | undefined;
  areasLimited?: boolean | undefined;
}

export function SearchFilterPane({
  action = '/search',
  formAction = action,
  extraParams = {},
  includeTopics = true,
  includeDataPeriod = false,
  includeGeography = true,
  includeSearch = true,
  variant = 'card',
  compact = false,
  additionalFilters,
  subtopicFilter,
  state,
  facets,
  displayGroups,
  gaAreaNames,
  geographyOptions,
  areasLimited,
}: SearchFilterPaneProps) {
  const card = { variant, headingLevel: variant === 'accordion' ? (3 as const) : (2 as const) };
  const urlFor = (next: SearchState) => searchUrl(next, action, extraParams);
  const navigate = useNavigate();
  const location = useLocation();
  const pendingState = useRef(state);
  const committedState = useRef(state);
  if (committedState.current !== state) {
    committedState.current = state;
    pendingState.current = state;
  }
  const [keywordReset, setKeywordReset] = useState(0);
  const drafts = useRef<Record<string, string>>(
    (location.state as { searchDrafts?: Record<string, string> } | null)?.searchDrafts ?? {},
  );
  const committed = useRef<Record<string, string>>({
    q: state.q,
    ...Object.fromEntries(
      DIMENSIONS.map((dim) => [dim.param, JSON.stringify(state[dim.stateKey])]),
    ),
  });
  if (committed.current.q !== state.q) {
    delete drafts.current.q;
    committed.current.q = state.q;
  }
  for (const dim of DIMENSIONS) {
    const selected = JSON.stringify(state[dim.stateKey]);
    if (committed.current[dim.param] !== selected) {
      delete drafts.current[dim.param];
      committed.current[dim.param] = selected;
    }
  }

  const nav = (next: SearchState) => {
    pendingState.current = next;
    const searchDrafts = { ...drafts.current };
    for (const dim of DIMENSIONS) {
      if (JSON.stringify(state[dim.stateKey]) !== JSON.stringify(next[dim.stateKey])) {
        delete searchDrafts[dim.param];
      }
    }
    drafts.current = searchDrafts;
    void navigate(urlFor(next), {
      replace: true,
      preventScrollReset: true,
      state: { searchDrafts },
    });
  };

  const addToList = (key: keyof SearchState, value: string) => {
    const list = state[key] as string[];
    if (list.includes(value)) return;
    nav({ ...state, [key]: [...list, value] });
  };

  const topicLabels = new Map(facets.topics.map((t) => [t.slug, t.title]));
  const classifLabels = new Map(
    facets.classifications.map((c) => [`${c.dimension}:${c.slug}`, c.name]),
  );

  const optionsForDimension = (dim: (typeof DIMENSIONS)[number]): AutocompleteOption[] => {
    if (dim.isTopicDimension) {
      return facets.topics.map((t) => ({ value: t.slug, label: t.title }));
    }
    if (dim.classificationDimension) {
      return facets.classifications
        .filter((c) => c.dimension === dim.classificationDimension)
        .map((c) => ({ value: c.slug, label: c.name }));
    }
    if (dim.stateKey === 'sources') return facets.sources.map((s) => ({ value: s, label: s }));
    if (dim.stateKey === 'valueTypes')
      return facets.valueTypes.map((v) => ({ value: v, label: v }));
    if (dim.stateKey === 'yearTypes') return facets.yearTypes.map((y) => ({ value: y, label: y }));
    return [];
  };

  const labelOf = (dim: (typeof DIMENSIONS)[number], value: string): string => {
    if (dim.isTopicDimension) return topicLabels.get(value) ?? value;
    if (dim.classificationDimension)
      return classifLabels.get(`${dim.classificationDimension}:${value}`) ?? value;
    return value;
  };

  const topicsActive =
    Boolean(state.subtopics?.length) ||
    state.topics.length > 0 ||
    state.indicatorTypes.length > 0 ||
    state.lifeStages.length > 0;
  const geoActive = state.geoLevels.length > 0 || state.gaCodes.length > 0;
  const fwActive = state.frameworks.length > 0;
  const popActive = state.populations.length > 0 || state.inequalities.length > 0;
  const dataAttrActive =
    state.sources.length > 0 || state.valueTypes.length > 0 || state.yearTypes.length > 0;

  const clearTopicsUrl = urlFor({
    ...state,
    subtopics: [],
    topics: [],
    indicatorTypes: [],
    lifeStages: [],
  });
  const clearGeoUrl = urlFor({ ...state, geoLevels: [], gaCodes: [] });
  const clearFwUrl = urlFor({ ...state, frameworks: [] });
  const clearPopUrl = urlFor({ ...state, populations: [], inequalities: [] });
  const clearDataAttrUrl = urlFor({ ...state, sources: [], valueTypes: [], yearTypes: [] });
  const clearAllFiltersUrl = urlFor({ ...EMPTY_SEARCH_STATE, q: state.q });
  const clearQUrl = urlFor({ ...state, q: '' });

  const topicsAndTypesDims = DIMENSIONS.filter(
    (d) => ['t', 'it', 'ls'].includes(d.param) && (includeTopics || d.param !== 't'),
  );
  const fwDims = DIMENSIONS.filter((d) => d.param === 'fw');
  const popDims = DIMENSIONS.filter((d) => ['pg', 'eq'].includes(d.param));
  const dataDims = DIMENSIONS.filter((d) => ['src', 'vt', 'per'].includes(d.param));

  const renderDimensionBody = (dim: (typeof DIMENSIONS)[number]) =>
    variant === 'accordion' ? null : (
      <FilterDimensionBody
        key={dim.param}
        urlFor={urlFor}
        facetLabelOf={(v) => labelOf(dim, v)}
        isTopicDimension={dim.isTopicDimension}
        selected={state[dim.stateKey] as string[]}
        selectedLabel={dim.selectedLabel}
        state={state}
        stateKey={dim.stateKey}
      />
    );

  const renderDimensionFooter = (dim: (typeof DIMENSIONS)[number]) =>
    variant === 'accordion' ? (
      <FilterDimensionChoices
        key={dim.param}
        action={formAction}
        extraParams={extraParams}
        label={dim.selectedLabel
          .replace(/^Selected /, '')
          .replace(/^./, (value) => value.toUpperCase())}
        options={optionsForDimension(dim)}
        param={dim.param}
        state={state}
        stateKey={dim.stateKey}
        onChange={(values) => nav({ ...pendingState.current, [dim.stateKey]: values })}
      />
    ) : (
      <FilterDimensionFooter
        key={`${dim.param}-${JSON.stringify(state[dim.stateKey])}`}
        action={formAction}
        extraParams={extraParams}
        draftValue={drafts.current[dim.param]}
        onDraftChange={(value) => {
          drafts.current[dim.param] = value;
        }}
        addButtonLabel={dim.addButtonLabel}
        autocompleteLabel={dim.autocompleteLabel}
        noResultsMessage={dim.noResultsMessage}
        onAdd={(v) => addToList(dim.stateKey, v)}
        options={optionsForDimension(dim).filter(
          (o) => !(state[dim.stateKey] as string[]).includes(o.value),
        )}
        param={dim.param}
        state={state}
      />
    );

  return (
    <div className={variant === 'accordion' ? 'fphd-topic-indicator-filters' : undefined}>
      {includeSearch ? (
        <Form
          action={formAction}
          method="get"
          replace
          onChangeCapture={(event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement)) return;
            if (target.name === 'q') drafts.current.q = target.value;
          }}
        >
          <HiddenFilters except="q" state={state} extraParams={extraParams} />
          <div className="govuk-!-margin-top-4">
            <SearchField
              key={`${state.q}-${keywordReset}`}
              action={
                <Link
                  className="govuk-link govuk-body-s"
                  onClick={() => {
                    delete drafts.current.q;
                    setKeywordReset((value) => value + 1);
                  }}
                  preventScrollReset
                  replace
                  to={clearQUrl}
                >
                  Clear search
                </Link>
              }
              id="search-q"
              label="Search by keywords"
              name="q"
              defaultValue={drafts.current.q ?? state.q}
            />
          </div>
        </Form>
      ) : null}

      <div className="fphd-search-bar__filters-row">
        <h2 className="govuk-heading-m govuk-!-margin-bottom-0">
          {variant === 'accordion' ? 'Indicator filters' : 'Filters'}
        </h2>
        <Link
          className="govuk-link govuk-body-s"
          preventScrollReset
          replace
          to={clearAllFiltersUrl}
        >
          Clear all filters
        </Link>
      </div>

      <CollapsibleFilterCard
        {...card}
        active={topicsActive}
        footer={
          <>
            {subtopicFilter}
            {topicsAndTypesDims.map(renderDimensionFooter)}
          </>
        }
        onClear={clearTopicsUrl}
        title={includeTopics ? 'Topics and types' : 'Subtopics and types'}
      >
        {topicsAndTypesDims.map(renderDimensionBody)}
      </CollapsibleFilterCard>

      {includeGeography ? (
        <CollapsibleFilterCard
          {...card}
          active={geoActive || Boolean(geographyOptions?.query || geographyOptions?.level)}
          footer={
            <SearchGeographyPicker
              key={JSON.stringify([state.gaCodes, state.geoLevels])}
              action={formAction}
              extraParams={extraParams}
              state={state}
              displayGroups={displayGroups}
              geographyOptions={geographyOptions}
              onApply={nav}
            />
          }
          onClear={clearGeoUrl}
          title="Geography"
        >
          {areasLimited ? (
            <p className="govuk-body-s">
              You can select up to {MAX_SELECTED_AREAS} areas. Only the first {MAX_SELECTED_AREAS}{' '}
              have been selected.
            </p>
          ) : null}
          <p className="govuk-body govuk-!-font-weight-bold govuk-!-margin-bottom-1">
            Selected geographies
          </p>
          {state.geoLevels.length === 0 && state.gaCodes.length === 0 ? (
            <div className="fphd-filter-chips fphd-filter-chips--inline govuk-!-margin-bottom-4">
              <p className="govuk-body-s govuk-!-margin-bottom-0">None selected</p>
            </div>
          ) : (
            <FilterChips className="govuk-!-margin-bottom-4">
              {state.geoLevels.map((level) => (
                <FilterChip
                  key={level}
                  onRemove={urlFor(removeFrom(state, 'geoLevels', level))}
                  removeLabel={level}
                  replace
                  value={level}
                >
                  {level}
                </FilterChip>
              ))}
              {state.gaCodes.map((code) => (
                <FilterChip
                  key={code}
                  onRemove={urlFor(removeFrom(state, 'gaCodes', code))}
                  removeLabel={gaAreaNames[code] ?? code}
                  replace
                  value={code}
                >
                  {gaAreaNames[code] ?? code}
                </FilterChip>
              ))}
            </FilterChips>
          )}
        </CollapsibleFilterCard>
      ) : null}

      <CollapsibleFilterCard
        {...card}
        active={fwActive}
        footer={fwDims.map(renderDimensionFooter)}
        hint="Established frameworks used to group or report indicators."
        onClear={clearFwUrl}
        title={variant === 'accordion' ? 'Frameworks and programmes' : 'Frameworks'}
      >
        {fwDims.map(renderDimensionBody)}
      </CollapsibleFilterCard>

      {!compact ? (
        <>
          {popActive || popDims.some((dim) => optionsForDimension(dim).length > 0) ? (
            <CollapsibleFilterCard
              {...card}
              active={popActive}
              footer={popDims.map(renderDimensionFooter)}
              onClear={clearPopUrl}
              title="Populations and inequalities"
            >
              {popDims.map(renderDimensionBody)}
            </CollapsibleFilterCard>
          ) : null}

          <CollapsibleFilterCard
            {...card}
            active={dataAttrActive}
            footer={dataDims.map(renderDimensionFooter)}
            onClear={clearDataAttrUrl}
            title={variant === 'accordion' ? 'About the data' : 'Data attributes'}
          >
            {dataDims.map(renderDimensionBody)}
          </CollapsibleFilterCard>
          {additionalFilters}
          {includeDataPeriod && variant === 'accordion' ? (
            <CollapsibleFilterCard {...card} active={false} title="Status">
              <p className="govuk-body-s">
                Release status information is not available for this dataset.
              </p>
            </CollapsibleFilterCard>
          ) : null}
          {includeDataPeriod ? (
            <SearchPeriodFilter
              key={JSON.stringify([state.fromYear, state.toYear, state.updatedWithin])}
              action={action}
              formAction={formAction}
              extraParams={extraParams}
              state={state}
              variant={variant}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
