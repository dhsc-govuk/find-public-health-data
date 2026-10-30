import {
  ciMethodListSchema,
  dataProviderListSchema,
  dataTableConfirmationErrorSchema,
  dataTableConfirmedSchema,
  dataUploadCreatedSchema,
  dataUploadErrorSchema,
  indicatorSectionResponseSchema,
  indicatorTaskListSchema,
  tagOptionsSchema,
  valueTypeAndUnitOptionsSchema,
} from '@fphd/internal-api-features/contract';
import { type ApiWriteResult, apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { type ActionFunctionArgs, type RouterContextProvider, redirect } from 'react-router';

import { devToolsContext } from '../dev-tools.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { lockedDraftRedirect, unlessDraftLocked } from '../locked-draft.ts';
import { indicatorTaskListPath } from '../publish-paths.ts';
import { SAMPLE_DATA_TABLE, sampleAnswers } from './answers.ts';

/** The saved value, or the overview for a draft locked meanwhile; any other refusal is a bug. */
function saved<T>(
  context: Readonly<RouterContextProvider>,
  id: string,
  task: string,
  result: ApiWriteResult<T, { error: string }>,
): T | Response {
  if (result.ok) return result.data;
  if (result.error.error === 'locked') return lockedDraftRedirect(context, id);
  throw new Error(`The API refused the sample ${task}: ${JSON.stringify(result.error)}`);
}

/** The sample table as a multipart form with one file, as the upload page sends it. */
function sampleDataTableForm() {
  const form = new FormData();
  form.append('dataTable', new Blob([SAMPLE_DATA_TABLE], { type: 'text/csv' }), 'sample.csv');
  const multipart = new Response(form);

  return { body: multipart.body, contentType: multipart.headers.get('content-type') ?? '' };
}

/**
 * Answers every task the draft has not completed with sample answers, uploading and confirming
 * the sample data table, through the API calls the task pages make, then returns to the task
 * list. Not found unless the app offers development tools.
 */
export async function fillInSampleAnswers({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<Response> {
  if (!context.get(devToolsContext)) throw new Response('Not Found', { status: 404 });

  const id = requireIndicatorId(params);
  const api = context.get(apiContext);
  const { tasks, editable } = await api.get(
    apiPath`/api/internal/indicators/${id}/task-list`,
    indicatorTaskListSchema,
  );

  if (!editable) return lockedDraftRedirect(context, id);

  const [valueTypesAndUnits, ciMethods, dataProviders, tags] = await Promise.all([
    api.get('/api/internal/value-types-and-units', valueTypeAndUnitOptionsSchema),
    api.get('/api/internal/ci-methods', ciMethodListSchema),
    api.get('/api/internal/data-providers', dataProviderListSchema),
    api.get('/api/internal/tags', tagOptionsSchema),
  ]);
  const samples = sampleAnswers(
    { valueTypesAndUnits, ciMethods, dataProviders, tags },
    new Date(),
  ).filter(({ key }) => tasks[key] !== 'completed');

  // One at a time, as a publisher saves them, so no two writes to the draft race.
  for (const { key, answers, schema, answersSchema, errorSchema } of samples) {
    // Stops once the browser has gone, rather than saving the rest for no one.
    request.signal.throwIfAborted();
    const path = apiPath`/api/internal/indicators/${id}/${key}`;
    const responseSchema = indicatorSectionResponseSchema(answersSchema);
    const { version } = await unlessDraftLocked(context, id, api.get(path, responseSchema));
    const result = await api.put(
      path,
      { answers: schema.parse(answers), version },
      responseSchema,
      errorSchema,
    );
    // Someone saved the section since it was read, as a second press does. Their answers stay.
    if (!result.ok && result.error.error === 'changed') continue;
    const outcome = saved(context, id, `${key} answers`, result);
    if (outcome instanceof Response) return outcome;
  }

  if (tasks['data-table'] !== 'completed') {
    const uploaded = saved(
      context,
      id,
      'data table',
      await api.postStream(
        apiPath`/api/internal/indicators/${id}/data-uploads`,
        sampleDataTableForm(),
        dataUploadCreatedSchema,
        dataUploadErrorSchema,
        request.signal,
      ),
    );
    if (uploaded instanceof Response) return uploaded;

    const confirmation = await api.put(
      apiPath`/api/internal/indicators/${id}/data-table/confirmation`,
      { batchId: uploaded.id },
      dataTableConfirmedSchema,
      dataTableConfirmationErrorSchema,
    );
    // A second press uploaded a table over this one, and that request confirms its own.
    if (confirmation.ok || confirmation.error.error !== 'data_table_changed') {
      const confirmed = saved(context, id, 'data table confirmation', confirmation);
      if (confirmed instanceof Response) return confirmed;
    }
  }

  return redirect(indicatorTaskListPath(id));
}
