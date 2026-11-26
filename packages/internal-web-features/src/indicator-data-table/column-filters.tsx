import {
  DATA_TABLE_SEARCH_MAX_LENGTH,
  type DataTableColumnValues,
  MAX_DATA_TABLE_FILTERS,
  MAX_LISTED_DATA_TABLE_VALUES,
} from '@fphd/internal-api-features/contract';
import { Button, Checkboxes, FilterChip, FilterChips, Input, Label } from '@fphd/ui';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { indicatorDataTableCheckPath } from '../publish-paths.ts';
import { type CheckColumn, checkColumns, filterLabel } from './check-data.ts';
import type { DataTableCheckData } from './check-loader.ts';
import {
  ADD_VALUES_INTENT,
  COLUMN_FILTERS_FORM,
  FORM_FIELD,
  SEARCH_VALUES_INTENT,
  showValuesIntent,
} from './column-filters-form.ts';
import type { ColumnFilterState } from './column-filters-loader.ts';
import { useListedValues, useValueSearch } from './use-column-values.ts';

interface ColumnValuesProps {
  column: CheckColumn;
  listed: DataTableColumnValues;
  pending: readonly string[];
  onTick: (filterId: string, ticked: boolean) => void;
}

/** The values of an opened column, as checkboxes. */
function ColumnValues({ column, listed, pending, onTick }: ColumnValuesProps) {
  return (
    <div className="fphd-geo-alt__children">
      <Checkboxes
        classModifiers="small"
        id={`filter-${column.key}`}
        label={<span className="govuk-visually-hidden">Values of {column.heading}</span>}
        name="f"
        onChange={(event) => onTick(event.target.value, event.target.checked)}
        options={listed.values.map(({ id, label }) => ({
          label,
          value: id,
          checked: pending.includes(id),
        }))}
      />
      {listed.more ? (
        <p className="govuk-body-s fphd-geo-alt__more">
          Showing the first {MAX_LISTED_DATA_TABLE_VALUES} — search to find the rest
        </p>
      ) : null}
    </div>
  );
}

interface ColumnFiltersProps
  extends Pick<DataTableCheckData, 'id' | 'dataTable' | 'filtersLimited'> {
  /** What the form answered, when it was sent without JavaScript. */
  state?: ColumnFilterState | undefined;
}

/** The heading of the column filters, which takes focus when the last selected value is removed. */
const FILTERS_HEADING_ID = 'column-filters-heading';

/** The heading of the selected values, which takes focus when one of them is removed. */
const SELECTED_HEADING_ID = 'column-filters-selected';

/**
 * Chooses the values that the check page's table is filtered by. Ticked values apply when they are
 * added. Without JavaScript the form's buttons search, list a column's values and add the ticked
 * ones, and the form carries what has been chosen so far.
 */
export function ColumnFilters({ id, dataTable, filtersLimited, state }: ColumnFiltersProps) {
  const navigate = useNavigate();
  const values = useListedValues(id, state?.opened ?? []);
  const search = useValueSearch(id, state);
  const [pending, setPending] = useState<string[]>(state?.ticked ?? []);
  // Without JavaScript the count could not follow the ticks, so the server leaves it out.
  const [counting, setCounting] = useState(false);
  useEffect(() => setCounting(true), []);
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  const added = useRef(false);
  const { filters, page, rowsPerPage } = dataTable;
  const filterIds = filters.map((filter) => filter.id);
  const pathWith = (ids: readonly string[]) =>
    indicatorDataTableCheckPath(id, { rowsPerPage, filterIds: ids });
  // A chip's remove link names the heading that takes focus once the page shows the values left,
  // with or without JavaScript, as its own link goes with the chip.
  const pathWithout = (filterId: string) => {
    const kept = filterIds.filter((other) => other !== filterId);
    return `${pathWith(kept)}#${kept.length > 0 ? SELECTED_HEADING_ID : FILTERS_HEADING_ID}`;
  };

  // The Add values button goes once its values are added, so focus moves to where they are.
  useEffect(() => {
    if (!added.current || filters.length === 0) return;
    added.current = false;
    selectedHeading.current?.focus({ preventScroll: true });
  }, [filters]);

  const tick = (filterId: string, ticked: boolean) =>
    setPending((current) =>
      ticked ? [...current, filterId] : current.filter((value) => value !== filterId),
    );

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.length === 0) return;
    added.current = true;
    setPending([]);
    values.closeAll();
    search.setText('');
    // One more than the most allowed is enough for the page to say that some were left out.
    const chosen = [...new Set([...filterIds, ...pending])].slice(0, MAX_DATA_TABLE_FILTERS + 1);
    void navigate(pathWith(chosen), {
      preventScrollReset: true,
    });
  };

  const columns = checkColumns(dataTable.columns);
  const openColumns = values.open.flatMap((key) => values.listed[key] ?? []);
  const listed = search.results ?? openColumns;
  const listedIds = listed.flatMap((column) => column.values.map((value) => value.id));

  return (
    <div className="fphd-column-filters">
      <div className="fphd-column-filters__header">
        <h2
          className="govuk-heading-s govuk-!-margin-bottom-0"
          id={FILTERS_HEADING_ID}
          tabIndex={-1}
        >
          Column filters
        </h2>
      </div>
      <div className="fphd-column-filters__selected">
        <p className="govuk-body-s govuk-!-margin-bottom-3">
          <Link className="govuk-link" preventScrollReset to={pathWith([])}>
            Clear filters
          </Link>
        </p>
        {filters.length === 0 ? null : (
          <>
            <h3
              className="govuk-heading-s govuk-!-margin-bottom-2"
              id={SELECTED_HEADING_ID}
              ref={selectedHeading}
              tabIndex={-1}
            >
              Selected values
            </h3>
            {filtersLimited ? (
              <p className="govuk-body-s">
                You can select up to {MAX_DATA_TABLE_FILTERS} values. Only the first{' '}
                {MAX_DATA_TABLE_FILTERS} have been selected.
              </p>
            ) : null}
            <FilterChips className="govuk-!-margin-bottom-0">
              {filters.map((filter) => (
                <FilterChip
                  key={filter.id}
                  onRemove={pathWithout(filter.id)}
                  removeLabel={filterLabel(filter)}
                  value={filter.id}
                >
                  {filterLabel(filter)}
                </FilterChip>
              ))}
            </FilterChips>
          </>
        )}
      </div>
      <form
        action={indicatorDataTableCheckPath(id, { page, rowsPerPage, filterIds })}
        className="fphd-column-filters__add"
        method="post"
        onSubmit={add}
      >
        <input name={FORM_FIELD} type="hidden" value={COLUMN_FILTERS_FORM} />
        <FilterInputs filterIds={filterIds} />
        {/* Ticks on values that are not listed now must still be sent. */}
        <FilterInputs filterIds={pending.filter((filterId) => !listedIds.includes(filterId))} />
        {openColumns.map(({ column }) => (
          <input key={column} name="open" type="hidden" value={column} />
        ))}
        <div className="govuk-form-group govuk-!-margin-bottom-2">
          <Label classModifiers="s" htmlFor="column-filter-search">
            Add values
          </Label>
          <Input
            autoComplete="off"
            className="fphd-geo-search"
            id="column-filter-search"
            maxLength={DATA_TABLE_SEARCH_MAX_LENGTH}
            name="search"
            onChange={(event) => search.setText(event.currentTarget.value)}
            // Values are found as they are typed, and Enter must not add the ticked ones.
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
            placeholder="Type to find values"
            type="search"
            value={search.text}
          />
        </div>
        <noscript>
          <Button
            className="govuk-!-margin-bottom-2"
            classModifiers="secondary"
            name="intent"
            type="submit"
            value={SEARCH_VALUES_INTENT}
          >
            Find values
          </Button>
        </noscript>
        <section
          aria-label="Table columns and values"
          className="fphd-geo-alt__tree"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the list must scroll by keyboard.
          tabIndex={0}
        >
          <div role="status">
            {search.finding ? <p className="govuk-visually-hidden">Finding values…</p> : null}
            {search.failed ? (
              <p className="govuk-body-s">Value search is not working right now. Try again.</p>
            ) : null}
            {!search.finding && search.results?.length === 0 ? (
              <p className="govuk-body-s govuk-!-margin-bottom-0">No values match your search.</p>
            ) : null}
          </div>
          {search.results === undefined
            ? columns.map((column) => (
                <TreeColumn
                  column={column}
                  key={column.key}
                  onTick={tick}
                  pending={pending}
                  values={values}
                />
              ))
            : search.results.map((found) => {
                const column = columns.find(({ key }) => key === found.column);
                return column === undefined ? null : (
                  <div key={column.key}>
                    <p className="govuk-body govuk-!-margin-bottom-0">{column.heading}</p>
                    <ColumnValues column={column} listed={found} onTick={tick} pending={pending} />
                  </div>
                );
              })}
        </section>
        {pending.length > 0 ? (
          <Button
            className="fphd-button--full-width govuk-!-margin-bottom-0"
            name="intent"
            type="submit"
            value={ADD_VALUES_INTENT}
          >
            {counting ? `Add values (${pending.length})` : 'Add values'}
          </Button>
        ) : listed.length > 0 ? (
          <noscript>
            <Button
              className="fphd-button--full-width govuk-!-margin-bottom-0"
              name="intent"
              type="submit"
              value={ADD_VALUES_INTENT}
            >
              Add values
            </Button>
          </noscript>
        ) : null}
      </form>
    </div>
  );
}

interface TreeColumnProps extends Pick<ColumnValuesProps, 'column' | 'pending' | 'onTick'> {
  values: ReturnType<typeof useListedValues>;
}

/** A column that opens to list its values. */
function TreeColumn({ column, values, pending, onTick }: TreeColumnProps) {
  const { key, heading } = column;
  const isOpen = values.open.includes(key);
  const listed = values.listed[key];

  return (
    <div>
      <div className="fphd-geo-alt__group">
        <button
          aria-expanded={isOpen}
          className={`fphd-geo-alt__toggle${isOpen ? ' fphd-geo-alt__toggle--open' : ''}`}
          onClick={() => values.toggle(key)}
          type="button"
        >
          <span aria-hidden="true" className="fphd-geo-alt__chevron" />
          <span className="govuk-body govuk-!-margin-bottom-0">{heading}</span>
        </button>
      </div>
      <noscript>
        <Button
          className="govuk-!-margin-bottom-2"
          classModifiers="secondary"
          name="intent"
          type="submit"
          value={showValuesIntent(key)}
        >
          Show values in {heading}
        </Button>
      </noscript>
      {values.failed.includes(key) ? (
        <p className="govuk-body-s" role="status">
          Could not load {heading}. Expand it to try again.
        </p>
      ) : null}
      <p aria-live="polite" className="govuk-visually-hidden">
        {isOpen && listed === undefined ? `Loading ${heading}…` : ''}
      </p>
      {isOpen && listed !== undefined ? (
        <ColumnValues column={column} listed={listed} onTick={onTick} pending={pending} />
      ) : null}
    </div>
  );
}

/** The filters in use, sent with a form that asks for the table another way. */
export function FilterInputs({ filterIds }: { filterIds: readonly string[] }) {
  return filterIds.map((filterId) => (
    <input key={filterId} name="f" type="hidden" value={filterId} />
  ));
}
