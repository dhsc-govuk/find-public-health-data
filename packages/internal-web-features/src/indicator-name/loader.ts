// No @fphd/ui imports here, so the loader and actions unit-test without the jsdom the components need.
import {
  type IndicatorField,
  indicatorAdminDetailSchema,
  indicatorCreateErrorSchema,
  indicatorCreateIdSchema,
  indicatorCreateResponseSchema,
  indicatorFieldSchema,
  indicatorNameSchema,
  indicatorUpdateErrorSchema,
  toFieldErrors,
} from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';
import { v7 as uuidv7 } from 'uuid';

import { versionedAction } from '../edit-version.ts';
import { requireEditableIndicator } from '../editable-indicator.ts';
import { formRefusal } from '../form-refusal.ts';
import { readFormValues } from '../form-values.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import type { FormFailure } from '../indicator-section.ts';
import { lockedDraftRedirect } from '../locked-draft.ts';
import { requireNewIndicatorTeam } from '../new-indicator-team.ts';
import { indicatorTaskListPath } from '../publish-paths.ts';
import { NEW_INDICATOR_ID_FIELD } from './new-indicator-id.ts';

export type IndicatorNameFailure = FormFailure<IndicatorField>;

/** Shown when a rename is rejected because someone changed the name after the page loaded. */
export const NAME_CHANGED =
  'Someone else has changed the name since you opened this page. Your name has not been saved. Select Continue to save it and replace their change.';

const FIELDS = indicatorFieldSchema.options;

function notFound(): Response {
  return new Response('Not Found', { status: 404 });
}

/**
 * A new indicator is named once its team is known, so a publisher in several chooses first. The
 * page is given the id the indicator will take, so a double click or a retry of its form sends
 * the same id and the API answers it with the indicator the first request created. Each showing
 * of the page, including the one after a refused name, mints a new id.
 */
export function loadNewIndicator({ context, request }: LoaderFunctionArgs): { id: string } {
  requireNewIndicatorTeam(context, request);

  return { id: uuidv7() };
}

/**
 * The id the form sent for the new indicator. A form shown before it carried one sends none,
 * and gets a new id, so it still creates the indicator without the protection against a repeat.
 */
function newIndicatorId(formData: FormData): string {
  const sent = indicatorCreateIdSchema.safeParse({ id: formData.get(NEW_INDICATOR_ID_FIELD) });

  return sent.success ? sent.data.id : uuidv7();
}

/**
 * Creates the indicator in its team and sends the publisher to its task list, where the rest of
 * the journey is. The API's schema is applied here first, so an empty name costs no round trip.
 */
export async function createIndicator({
  context,
  request,
}: ActionFunctionArgs): Promise<IndicatorNameFailure | Response> {
  const teamId = requireNewIndicatorTeam(context, request);
  const formData = await request.formData();
  const values = readFormValues(formData, FIELDS);
  const submission = indicatorNameSchema.safeParse(values);

  if (!submission.success) {
    return { values, fieldErrors: toFieldErrors(submission.error, indicatorFieldSchema) };
  }

  const result = await context
    .get(apiContext)
    .post(
      '/api/internal/indicators',
      { ...submission.data, teamId, id: newIndicatorId(formData) },
      indicatorCreateResponseSchema,
      indicatorCreateErrorSchema,
    );

  if (!result.ok) {
    return { values, ...formRefusal(result.error) };
  }

  return redirect(indicatorTaskListPath(result.data.id));
}

/** Only a draft can be renamed, so a published indicator has no name page. */
export async function loadIndicatorName({ context, params }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);
  const indicator = await context
    .get(apiContext)
    .get(apiPath`/api/internal/indicators/${id}`, indicatorAdminDetailSchema);

  if (indicator.draftStatus === null) throw notFound();
  requireEditableIndicator(context, indicator);
  if (indicator.draftLocked) throw lockedDraftRedirect(context, id);

  return { indicator };
}

/**
 * Renames the draft and returns to the task list the publisher came from. If the name has
 * changed since the page was shown, it saves nothing and shows an error.
 */
export const saveIndicatorName = versionedAction(
  async ({ context, params }, { formData, version }): Promise<IndicatorNameFailure | Response> => {
    const id = requireIndicatorId(params);
    const values = readFormValues(formData, FIELDS);
    const submission = indicatorNameSchema.safeParse(values);

    if (!submission.success) {
      return { values, fieldErrors: toFieldErrors(submission.error, indicatorFieldSchema) };
    }

    const result = await context
      .get(apiContext)
      .patch(
        apiPath`/api/internal/indicators/${id}`,
        { ...submission.data, version },
        indicatorAdminDetailSchema,
        indicatorUpdateErrorSchema,
      );

    if (!result.ok) {
      if (result.error.error === 'locked') return lockedDraftRedirect(context, id);
      if (result.error.error === 'changed') {
        return { values, fieldErrors: {}, formError: NAME_CHANGED, version: result.error.version };
      }
      return { values, ...formRefusal(result.error) };
    }

    return redirect(indicatorTaskListPath(id));
  },
);
