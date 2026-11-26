// No @fphd/ui imports here, so these unit-test without the jsdom the components need.
import {
  CHECK_COLUMN_KEYS,
  DATA_TABLE_SEARCH_MAX_LENGTH,
  type DataTableColumnValues,
  type DataTableValuesQuery,
  dataTableFilterIdsSchema,
  dataTablePageQuerySchema,
  dataTableValuesSchema,
  MAX_DATA_TABLE_FILTERS,
} from '@fphd/internal-api-features/contract';
import { isOneOf } from '@fphd/utils/is-one-of';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';

import { requireIndicatorId } from '../indicator-id.ts';
import { unlessDraftLocked } from '../locked-draft.ts';
import { indicatorDataTableCheckPath } from '../publish-paths.ts';
import { queryObject } from '../query-object.ts';
import type { ColumnFilterIntent } from './column-filters-form.ts';

/** What the column filters show after their form is sent. */
export interface ColumnFilterState {
  /** The search, or empty for none. */
  search: string;
  /** The columns with values that contain the search, and those values. */
  results: DataTableColumnValues[];
  /** True if the API could not be asked for the values searched for or of the open column. */
  failed: boolean;
  /** The column whose values are listed when there is no search. */
  opened: DataTableColumnValues[];
  /** The ids of the values ticked but not added yet. */
  ticked: string[];
}

function notFound(): Response {
  return new Response('Not Found', { status: 404 });
}

/** The values of the draft's data table that a query asks for. */
async function listValues(
  context: LoaderFunctionArgs['context'],
  id: string,
  { column, search }: DataTableValuesQuery,
): Promise<DataTableColumnValues[]> {
  const query = new URLSearchParams({
    ...(column === undefined ? {} : { column }),
    ...(search === '' ? {} : { search }),
  });
  const { columns } = await unlessDraftLocked(
    context,
    id,
    context
      .get(apiContext)
      .get(
        `${apiPath`/api/internal/indicators/${id}/data-table/values`}?${query}`,
        dataTableValuesSchema,
      ),
  );
  return columns;
}

/** Answers the check page's scripts with the values of the column opened in its filters. */
export async function loadDataTableValues({ context, params, request }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  const column = new URL(request.url).searchParams.get('column');

  if (!isOneOf(CHECK_COLUMN_KEYS, column)) throw notFound();

  return Response.json({ columns: await listValues(context, id, { column, search: '' }) });
}

/** The search a form carries. It is sent in the form's body, so it never appears in an address. */
function readSearch(formData: FormData): string {
  const search = formData.get('search');
  return typeof search === 'string' ? search.slice(0, DATA_TABLE_SEARCH_MAX_LENGTH).trim() : '';
}

/** True for an API that failed, took too long to answer or could not be reached. */
function isApiFailure(error: unknown): boolean {
  if (error instanceof Response) return error.status >= 500;
  if (error instanceof DOMException) return error.name === 'TimeoutError';
  // The message Node's fetch gives any connection it could not make.
  return error instanceof TypeError && error.message === 'fetch failed';
}

/** The values a query asks for, or undefined if the API failed. The API client logs why. */
async function listValuesIfAnswered(
  context: LoaderFunctionArgs['context'],
  id: string,
  query: DataTableValuesQuery,
): Promise<DataTableColumnValues[] | undefined> {
  try {
    return await listValues(context, id, query);
  } catch (error) {
    if (isApiFailure(error)) return undefined;
    throw error;
  }
}

/**
 * Adds the ticked values to the filters, or lists the values searched for or of a column. Only
 * adding changes the address. The table keeps the filters in the form's address, and the ticked
 * values, the search and the open column are in its body.
 */
export async function submitColumnFilters(
  { context, params, request }: ActionFunctionArgs,
  formData: FormData,
  intent: ColumnFilterIntent,
): Promise<ColumnFilterState | Response> {
  const id = requireIndicatorId(params);
  const query = dataTablePageQuerySchema.safeParse(queryObject(new URL(request.url).searchParams));
  const chosen = dataTableFilterIdsSchema.safeParse(formData.getAll('f'));

  if (!query.success || !chosen.success) throw notFound();

  const { rowsPerPage, filterIds } = query.data;

  if (intent.to === 'add') {
    // One more than the most allowed is enough for the page to say that some were left out.
    const added = chosen.data.slice(0, MAX_DATA_TABLE_FILTERS + 1);
    return redirect(indicatorDataTableCheckPath(id, { rowsPerPage, filterIds: added }));
  }

  const search = intent.to === 'search' ? readSearch(formData) : '';
  const column = intent.to === 'show' ? intent.column : formData.get('open');
  const [results, opened] = await Promise.all([
    search === '' ? [] : listValuesIfAnswered(context, id, { search }),
    isOneOf(CHECK_COLUMN_KEYS, column)
      ? listValuesIfAnswered(context, id, { column, search: '' })
      : [],
  ]);

  return {
    search,
    results: results ?? [],
    failed: results === undefined || opened === undefined,
    opened: opened ?? [],
    ticked: chosen.data.filter((filterId) => !filterIds.includes(filterId)),
  };
}
