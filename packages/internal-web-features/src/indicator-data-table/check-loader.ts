// No @fphd/ui imports here, so the loader and the action unit-test without the jsdom the components need.
import {
  dataTableCheckSchema,
  dataTableConfirmationErrorSchema,
  dataTableConfirmedSchema,
  dataTablePageQuerySchema,
} from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';

import { FORM_NOT_SAVED } from '../form-refusal.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { lockedDraftRedirect, unlessDraftLocked } from '../locked-draft.ts';
import {
  indicatorDataTableCheckPath,
  indicatorDataTablePath,
  indicatorTaskListPath,
} from '../publish-paths.ts';
import { queryObject } from '../query-object.ts';
import { readColumnFilterIntent } from './column-filters-form.ts';
import { type ColumnFilterState, submitColumnFilters } from './column-filters-loader.ts';

export const DATA_TABLE_CHANGED =
  'Another data table was uploaded while you were checking this one. Check the new data table.';

export interface DataTableCheckRefusal {
  formError: string;
}

function notFound(): Response {
  return new Response('Not Found', { status: 404 });
}

/**
 * Loads a page of the draft's uploaded data table. If no file has been uploaded yet, sends the
 * publisher to the upload page. A page after the last redirects to the last page; an invalid
 * query is a 404.
 */
export async function loadDataTableCheck({ context, params, request }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  const query = dataTablePageQuerySchema.safeParse(queryObject(new URL(request.url).searchParams));

  if (!query.success) throw notFound();

  const { page, rowsPerPage, filterIds, filtersLimited } = query.data;
  const apiQuery = new URLSearchParams([
    ['page', String(page)],
    ['rowsPerPage', String(rowsPerPage)],
    ...filterIds.map((filterId) => ['f', filterId]),
  ]);
  const { dataTable } = await unlessDraftLocked(
    context,
    id,
    context
      .get(apiContext)
      .get(
        `${apiPath`/api/internal/indicators/${id}/data-table`}?${apiQuery}`,
        dataTableCheckSchema,
      ),
  );

  if (dataTable === null) throw redirect(indicatorDataTablePath(id));

  const totalPages = Math.max(1, Math.ceil(dataTable.matchingRowCount / rowsPerPage));

  // A newer upload can have fewer pages than the publisher was on, so send them to its last.
  if (page > totalPages) {
    throw redirect(
      indicatorDataTableCheckPath(id, {
        page: totalPages,
        rowsPerPage,
        filterIds: dataTable.filters.map((filter) => filter.id),
      }),
    );
  }

  return { id, dataTable, totalPages, filtersLimited };
}

export type DataTableCheckData = Awaited<ReturnType<typeof loadDataTableCheck>>;

/** Answers the page's two forms: its column filters, or Continue, which confirms the data table. */
export async function submitDataTableCheck(
  args: ActionFunctionArgs,
): Promise<DataTableCheckRefusal | ColumnFilterState | Response> {
  const formData = await args.request.formData();
  const intent = readColumnFilterIntent(formData);

  return intent === undefined
    ? confirmDataTable(args, formData)
    : submitColumnFilters(args, formData, intent);
}

/**
 * Confirms the batch shown on the page and returns to the task list. If another upload has
 * replaced it in the meantime, shows the new one with a message instead.
 */
async function confirmDataTable(
  { context, params }: ActionFunctionArgs,
  formData: FormData,
): Promise<DataTableCheckRefusal | Response> {
  const id = requireIndicatorId(params);
  const batchId = formData.get('batchId');
  const result = await context
    .get(apiContext)
    .put(
      apiPath`/api/internal/indicators/${id}/data-table/confirmation`,
      { batchId: typeof batchId === 'string' ? batchId : '' },
      dataTableConfirmedSchema,
      dataTableConfirmationErrorSchema,
    );

  if (result.ok) return redirect(indicatorTaskListPath(id));
  if (result.error.error === 'locked') return lockedDraftRedirect(context, id);

  return {
    formError: result.error.error === 'data_table_changed' ? DATA_TABLE_CHANGED : FORM_NOT_SAVED,
  };
}
