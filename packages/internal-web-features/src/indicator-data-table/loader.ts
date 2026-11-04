// No @fphd/ui imports here, so the loaders and the action unit-test without the jsdom the components need.
import {
  DATA_TABLE_MAX_BYTES,
  DATA_TABLE_MESSAGES,
  type DataUploadField,
  dataUploadCreatedSchema,
  dataUploadErrorSchema,
  dataUploadLatestSchema,
  indicatorAdminDetailSchema,
} from '@fphd/internal-api-features/contract';
import { ApiTimeoutError, apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';

import { requireEditableIndicator } from '../editable-indicator.ts';
import { type FormRefusal, formRefusal } from '../form-refusal.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { lockedDraftRedirect, unlessDraftLocked } from '../locked-draft.ts';
import {
  indicatorDataTableCheckPath,
  indicatorDataTablePath,
  indicatorDataTableProblemsPath,
} from '../publish-paths.ts';

export type { DataTableProblem } from '@fphd/internal-api-features/contract';

export type DataTableUploadFailure = FormRefusal<DataUploadField>;

export const DATA_TABLE_TOO_SLOW = 'Your data table took too long to check. Try again.';

// The form wraps the file in a boundary and a few part headers, a few hundred bytes; a megabyte
// more than the file's own cap is generous, so a file just under it is never refused here.
const MAX_FORM_BYTES = DATA_TABLE_MAX_BYTES + 1_000_000;

/** True when a request's Content-Length says no form with an acceptable file could be that big. */
export function exceedsFormLimit(contentLength: string | null): boolean {
  return (
    contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_FORM_BYTES
  );
}

/** Only a draft takes a data table, so a published indicator has no upload page. */
export async function loadDataTableUpload({ context, params }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  const indicator = await context
    .get(apiContext)
    .get(apiPath`/api/internal/indicators/${id}`, indicatorAdminDetailSchema);

  if (indicator.draftStatus === null) throw new Response('Not Found', { status: 404 });
  requireEditableIndicator(context, indicator);
  if (indicator.draftLocked) throw lockedDraftRedirect(context, id);

  return { id };
}

/**
 * Streams the form to the API unread, which stores, checks and loads the file while the
 * publisher waits. A refused file's problems have a page of their own; a loaded one is shown
 * on the check page. A form that says it is too big is refused here without reaching the API.
 */
export async function uploadDataTable({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<DataTableUploadFailure | Response> {
  const id = requireIndicatorId(params);

  if (exceedsFormLimit(request.headers.get('content-length'))) {
    // Read to the end, so the browser gets the page rather than a reset connection.
    await request.body?.pipeTo(new WritableStream()).catch(() => {});
    return { fieldErrors: { dataTable: DATA_TABLE_MESSAGES.tooLarge } };
  }

  const result = await context
    .get(apiContext)
    .postStream(
      apiPath`/api/internal/indicators/${id}/data-uploads`,
      { body: request.body, contentType: request.headers.get('content-type') ?? '' },
      dataUploadCreatedSchema,
      dataUploadErrorSchema,
    )
    .catch((error: unknown) => {
      if (error instanceof ApiTimeoutError) return undefined;
      throw error;
    });

  if (result === undefined) return { fieldErrors: {}, formError: DATA_TABLE_TOO_SLOW };

  if (result.ok) return redirect(indicatorDataTableCheckPath(id));
  if (result.error.error === 'invalid_data_table') {
    return redirect(indicatorDataTableProblemsPath(id));
  }
  if (result.error.error === 'locked') return lockedDraftRedirect(context, id);
  return formRefusal(result.error);
}

/** The problems of the draft's latest upload, while it is a refused one. */
export async function loadDataTableProblems({ context, params }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  const { latestUpload } = await unlessDraftLocked(
    context,
    id,
    context
      .get(apiContext)
      .get(apiPath`/api/internal/indicators/${id}/data-uploads/latest`, dataUploadLatestSchema),
  );

  // Nothing to show once a later file has loaded, so the publisher is offered the upload again.
  if (latestUpload?.status !== 'failed') throw redirect(indicatorDataTablePath(id));

  return { id, problems: latestUpload.problems };
}
