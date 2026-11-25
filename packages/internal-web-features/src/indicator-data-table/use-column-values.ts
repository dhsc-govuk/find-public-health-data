import type {
  CheckColumnKey,
  DataTableColumnValues,
  DataTableValues,
} from '@fphd/internal-api-features/contract';
import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';

import { indicatorDataTableCheckPath, indicatorDataTableValuesPath } from '../publish-paths.ts';
import type { submitDataTableCheck } from './check-loader.ts';
import { COLUMN_FILTERS_FORM, FORM_FIELD, SEARCH_VALUES_INTENT } from './column-filters-form.ts';
import type { ColumnFilterState } from './column-filters-loader.ts';

type ListedValues = Partial<Record<CheckColumnKey, DataTableColumnValues>>;

/** Reads a column's values from the app's own server, when the column is first opened. */
async function fetchValues(
  id: string,
  column: CheckColumnKey,
  signal: AbortSignal,
): Promise<DataTableColumnValues> {
  const response = await fetch(indicatorDataTableValuesPath(id, column), { signal });
  if (!response.ok) throw new Error(`The values request answered ${response.status}`);
  const { columns }: DataTableValues = await response.json();
  return columns[0] ?? { column, values: [], more: false };
}

/** The values of the columns opened so far, and how each opened column is getting on. */
export function useListedValues(id: string, initial: readonly DataTableColumnValues[]) {
  const [listed, setListed] = useState<ListedValues>(() =>
    Object.fromEntries(initial.map((values) => [values.column, values])),
  );
  const [open, setOpen] = useState<CheckColumnKey[]>(() => initial.map(({ column }) => column));
  const [failed, setFailed] = useState<CheckColumnKey[]>([]);
  const requests = useRef(new Map<CheckColumnKey, AbortController>());

  useEffect(
    () => () => {
      for (const request of requests.current.values()) request.abort();
      requests.current.clear();
    },
    [],
  );

  const close = (column: CheckColumnKey) =>
    setOpen((current) => current.filter((key) => key !== column));

  const load = async (column: CheckColumnKey) => {
    const request = new AbortController();
    requests.current.set(column, request);
    setFailed((current) => current.filter((key) => key !== column));
    try {
      const values = await fetchValues(id, column, request.signal);
      setListed((current) => ({ ...current, [column]: values }));
    } catch {
      if (request.signal.aborted) return;
      // The column closes without its values, so opening it again tries again.
      close(column);
      setFailed((current) => [...current, column]);
    } finally {
      if (requests.current.get(column) === request) requests.current.delete(column);
    }
  };

  return {
    listed,
    open,
    failed,
    toggle: (column: CheckColumnKey) => {
      if (open.includes(column)) {
        close(column);
        return;
      }
      setOpen((current) => [...current, column]);
      if (listed[column] === undefined && !requests.current.has(column)) void load(column);
    },
    closeAll: () => setOpen([]),
  };
}

const SEARCH_DELAY_MS = 300;

/** Searches for values as the search is typed, with the same request as the form makes. */
export function useValueSearch(id: string, state: ColumnFilterState | undefined) {
  const { data, state: request, submit } = useFetcher<typeof submitDataTableCheck>();
  const [text, setText] = useState(state?.search ?? '');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const search = text.trim();
  const found = data !== undefined && 'results' in data ? data : state;
  const answered = found?.search === search;
  const failed = answered && found.failed;

  useEffect(() => () => clearTimeout(timer.current), []);

  const send = (next: string) =>
    submit(
      { [FORM_FIELD]: COLUMN_FILTERS_FORM, intent: SEARCH_VALUES_INTENT, search: next },
      {
        method: 'post',
        action: indicatorDataTableCheckPath(id),
        // A search changes nothing the page has loaded.
        defaultShouldRevalidate: false,
      },
    );

  // Only a change of text sends a search, so one that fails is not sent again by itself.
  const changeText = (next: string) => {
    setText(next);
    const wanted = next.trim();
    if (wanted === search) return;
    clearTimeout(timer.current);
    // A search under way will replace the results found, so they can't be relied on.
    const isFound = request === 'idle' && found?.search === wanted && !found.failed;
    if (wanted === '' || isFound) return;
    timer.current = setTimeout(() => void send(wanted), SEARCH_DELAY_MS);
  };

  return {
    text,
    setText: changeText,
    finding: search !== '' && !answered,
    failed,
    /** The last search's results until the next one's arrive. Undefined with nothing to show. */
    results:
      search !== '' && found !== undefined && found.search !== '' && !found.failed
        ? found.results
        : undefined,
  };
}
