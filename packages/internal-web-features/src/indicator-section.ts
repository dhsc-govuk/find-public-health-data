// No @fphd/ui imports here, so the loaders and actions unit-test without the jsdom the components need.
import {
  type IndicatorSection,
  type IndicatorTaskKey,
  indicatorSectionAnswersSchema,
  indicatorSectionErrorSchema,
  indicatorSectionFieldErrors,
  indicatorSectionResponseSchema,
} from '@fphd/internal-api-features/contract';
import { type ApiResponseSchema, apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type RouterContextProvider,
  redirect,
} from 'react-router';

import { versionedAction } from './edit-version.ts';
import { type FormRefusal, formRefusal } from './form-refusal.ts';
import { type ControlNames, type FormValues, readFormValues } from './form-values.ts';
import { requireIndicatorId } from './indicator-id.ts';
import { lockedDraftRedirect, unlessDraftLocked } from './locked-draft.ts';
import { indicatorTaskListPath } from './publish-paths.ts';

/** Shown when a save is rejected because someone changed the section after the page loaded. */
export const SECTION_CHANGED =
  'Someone else has changed this section since you opened this page. Your answers have not been saved. Select Continue to save them and replace their changes.';

/**
 * A rejected submission: the form as it was sent, and the errors. A `changed` error also
 * includes the section's current version, which the page's next save sends.
 */
export interface FormFailure<Field extends string, Values = FormValues<Field>>
  extends FormRefusal<Field> {
  values: Values;
  version?: string;
}

/** The control names, or how to read them from the submission where they depend on an answer. */
export type ControlNamesOf<Field extends string> =
  | ControlNames<Field>
  | ((formData: FormData) => ControlNames<Field>);

function sectionApiPath(id: string, key: IndicatorTaskKey): string {
  return apiPath`/api/internal/indicators/${id}/${key}`;
}

/**
 * The draft's answers to one section, and their version. The API returns 404 if there is no
 * draft. If the draft is locked for review, the publisher is sent to the overview.
 */
export async function loadIndicatorSectionAnswers<Answers>(
  { context, params }: LoaderFunctionArgs,
  key: IndicatorTaskKey,
  answersSchema: ApiResponseSchema<Answers>,
): Promise<{ id: string; answers: Answers; version: string }> {
  const id = requireIndicatorId(params);
  const { answers, version } = await unlessDraftLocked(
    context,
    id,
    context
      .get(apiContext)
      .get(sectionApiPath(id, key), indicatorSectionResponseSchema(answersSchema)),
  );

  return { id, answers, version };
}

/** The draft's answers as form values, and their version. */
export async function loadIndicatorSection<Field extends string, Values>(
  args: LoaderFunctionArgs,
  section: IndicatorSection<Field, Values>,
): Promise<{ id: string; values: FormValues<Field>; version: string }> {
  const { id, answers, version } = await loadIndicatorSectionAnswers(
    args,
    section.key,
    indicatorSectionAnswersSchema(section.fields),
  );

  return { id, values: section.formValues(answers), version };
}

/**
 * Saves answers the form has accepted and returns to the task list. If the API rejects them,
 * nothing is saved and the errors are returned. If the section has changed since `version`,
 * the errors include its current version.
 */
async function putIndicatorSection<Field extends string, ErrorField extends string>(
  context: Readonly<RouterContextProvider>,
  id: string,
  section: IndicatorSection<Field, unknown, unknown, ErrorField, never>,
  answers: unknown,
  version: string,
  answersSchema: ApiResponseSchema<unknown>,
): Promise<Response | (FormRefusal<Field | ErrorField> & { version?: string })> {
  const result = await context
    .get(apiContext)
    .put(
      sectionApiPath(id, section.key),
      { answers, version },
      indicatorSectionResponseSchema(answersSchema),
      indicatorSectionErrorSchema(section),
    );

  if (result.ok) return redirect(indicatorTaskListPath(id));
  if (result.error.error === 'locked') return lockedDraftRedirect(context, id);
  if (result.error.error === 'changed') {
    return { fieldErrors: {}, formError: SECTION_CHANGED, version: result.error.version };
  }
  return formRefusal(result.error);
}

/** A page's answers to save, and the page as it re-renders if they are refused. */
export interface SectionAnswers<Values, Input> {
  values: Values;
  answers: Input;
}

/** How a page saves its section; `Field` covers every field the page names. */
interface SaveSectionOptions<Field extends string, Values, Input> {
  /** The API's answer to a save, which is the section's answers. */
  answersSchema: ApiResponseSchema<unknown>;
  /** The answers to save, taking in an item typed or chosen but not yet added, or its refusal. */
  takeIn: (values: Values) => SectionAnswers<Values, Input> | FormFailure<Field, Values>;
  /** The version of the answers when the page was shown. */
  version: string;
}

/**
 * Saves the page's answers and returns to the task list, or saves nothing and re-renders the
 * page. The API's schema is applied here first, so an incomplete form costs no round trip.
 */
export async function saveIndicatorSectionValues<
  Field extends string,
  Input,
  Values,
  ErrorField extends string = Field,
  PageField extends string = Field | ErrorField,
>(
  context: Readonly<RouterContextProvider>,
  id: string,
  section: IndicatorSection<Field, unknown, Input, ErrorField, never>,
  sent: Values,
  {
    answersSchema,
    takeIn,
    version,
  }: SaveSectionOptions<Field | ErrorField | PageField, Values, Input>,
): Promise<FormFailure<Field | ErrorField | PageField, Values> | Response> {
  // The section names only its own fields, which are among the page's.
  type PageRefusal = FormRefusal<Field | ErrorField | PageField>;
  const taken = takeIn(sent);

  if ('fieldErrors' in taken) return taken;

  const { values, answers } = taken;
  const submission = section.schema.safeParse(answers);

  if (!submission.success) {
    const refusal = { fieldErrors: indicatorSectionFieldErrors(section, submission.error) };
    return { values, ...(refusal as PageRefusal) };
  }

  const saved = await putIndicatorSection(
    context,
    id,
    section,
    submission.data,
    version,
    answersSchema,
  );

  return saved instanceof Response ? saved : { values, ...(saved as PageRefusal) };
}

/** Saves every answer of a section whose page asks only its own fields, as text. */
export function saveIndicatorSection<Field extends string, Values>(
  args: ActionFunctionArgs,
  section: IndicatorSection<Field, Values>,
  controlNames: ControlNamesOf<Field> = {},
) {
  return versionedAction(async ({ context, params }, { formData, version }) => {
    const id = requireIndicatorId(params);
    const names = typeof controlNames === 'function' ? controlNames(formData) : controlNames;
    const values = readFormValues(formData, section.fields.options, names);

    return saveIndicatorSectionValues(context, id, section, values, {
      answersSchema: indicatorSectionAnswersSchema(section.fields),
      takeIn: (sent) => ({ values: sent, answers: sent }),
      version,
    });
  })(args);
}
