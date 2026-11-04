// No @fphd/ui imports here, so the loader and action unit-test without the components' jsdom.
import { canSchedulePublication } from '@fphd/auth/permissions';
import {
  indicatorAdminDetailSchema,
  indicatorScheduleErrorSchema,
  type PublishingDateField,
  publishingDateSection,
  scheduleSchemaFor,
  toFieldErrors,
} from '@fphd/internal-api-features/contract';
import { ukDateTime } from '@fphd/utils/uk-time';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { getSession } from '@fphd/web-server/session';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';

import { formRefusal } from '../form-refusal.ts';
import { type FormValues, readFormValues } from '../form-values.ts';
import { requireIndicatorId } from '../indicator-id.ts';
import { type OverviewFlash, setOverviewFlash } from '../indicator-overview/notifications.ts';
import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import type { FormFailure } from '../indicator-section.ts';
import { publishingDateControlNames } from '../publishing-date-form.ts';

/** The hidden field carrying the date the page showed, which the save sends back. */
export const SHOWN_FIELD = 'shownScheduledPublishAt';

type Values = FormValues<PublishingDateField>;

/** The page as the action re-renders it after a refusal, with the date it first showed. */
export type PublicationDateRefusal = FormFailure<PublishingDateField> & {
  shownScheduledPublishAt: string;
};

/** The page does not exist for a user who may not schedule publication, as the API's 403 means. */
function requireScheduler(context: LoaderFunctionArgs['context']): void {
  const session = getSession(context);

  if (session === undefined || !canSchedulePublication(session)) {
    throw new Response('Not Found', { status: 404 });
  }
}

/** The date and time an instant falls on in the UK, as the publisher's page shows them. */
function publicationDateValues(at: string): Values {
  const { year, month, day, hour, minute } = ukDateTime(new Date(at));
  const twoDigits = (value: number) => String(value).padStart(2, '0');

  return {
    publishingDateDay: String(day),
    publishingDateMonth: String(month),
    publishingDateYear: String(year),
    publishingTimeHour: twoDigits(hour),
    publishingTimeMinute: twoDigits(minute),
  };
}

function toOverview(context: ActionFunctionArgs['context'], id: string, flash: OverviewFlash) {
  setOverviewFlash(context, flash);
  return redirect(indicatorOverviewPath(id));
}

/**
 * The indicator's publication date, which the page opens with. One the workflow no longer lets the
 * admin confirm or change sends them to the overview, which says so.
 */
export async function loadPublicationDate({ context, params }: LoaderFunctionArgs) {
  const id = requireIndicatorId(params);

  requireScheduler(context);

  const { actions, draftScheduledPublishAt } = await context
    .get(apiContext)
    .get(apiPath`/api/internal/indicators/${id}`, indicatorAdminDetailSchema);
  const open = actions.includes('schedule') || actions.includes('change_publication_date');

  if (!open || draftScheduledPublishAt === null) {
    throw toOverview(context, id, 'publication-date-refused');
  }

  return {
    id,
    values: publicationDateValues(draftScheduledPublishAt),
    shownScheduledPublishAt: draftScheduledPublishAt,
  };
}

/**
 * Confirms the date and time as typed, or changes them once confirmed, and returns to the
 * overview, which says whether they were saved. A date refused re-renders the page.
 */
export async function confirmPublicationDate({
  context,
  params,
  request,
}: ActionFunctionArgs): Promise<PublicationDateRefusal | Response> {
  const id = requireIndicatorId(params);

  requireScheduler(context);

  const formData = await request.formData();
  const shownScheduledPublishAt = formData.get(SHOWN_FIELD);

  if (typeof shownScheduledPublishAt !== 'string') {
    throw new Response('Bad Request', { status: 400 });
  }

  const values = readFormValues(
    formData,
    publishingDateSection.fields.options,
    publishingDateControlNames,
  );
  const checked = scheduleSchemaFor(new Date()).safeParse(values);

  if (!checked.success) {
    return {
      values,
      shownScheduledPublishAt,
      fieldErrors: toFieldErrors(checked.error, publishingDateSection.fields),
    };
  }

  const result = await context
    .get(apiContext)
    .postToMember(
      apiPath`/api/internal/indicators/${id}/schedule`,
      { ...values, shownScheduledPublishAt },
      indicatorScheduleErrorSchema,
    );

  if (result.ok) return toOverview(context, id, 'publication-date-confirmed');
  if (result.error.error === 'validation_failed') {
    return { values, shownScheduledPublishAt, ...formRefusal(result.error) };
  }
  if (result.error.error === 'changed') return toOverview(context, id, 'publication-date-changed');
  return toOverview(context, id, 'publication-date-refused');
}
