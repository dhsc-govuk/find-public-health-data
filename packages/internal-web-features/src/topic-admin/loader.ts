// No @fphd/ui imports here, so the loaders unit-test without the jsdom the components need.
import {
  type TopicField,
  topicAdminDetailWithLinkCountSchema,
  topicAdminSummaryListSchema,
  topicCreateResponseSchema,
  topicDeleteErrorSchema,
  topicIdSchema,
  topicUpdateErrorSchema,
  topicUpdateResponseSchema,
} from '@fphd/internal-api-features/contract';
import { apiPath } from '@fphd/web-server/api-client';
import { apiContext } from '@fphd/web-server/api-context';
import { setFlash, takeFlash } from '@fphd/web-server/flash';
import { type ActionFunctionArgs, type LoaderFunctionArgs, redirect } from 'react-router';

import { versionedAction } from '../edit-version.ts';
import { type FormRefusal, formRefusal } from '../form-refusal.ts';
import { parseTopicForm, readTopicForm, type TopicFormValues } from './form.ts';
import { deleteTopicPath, editTopicPath, TOPICS_ADMIN_PATH } from './paths.ts';

export type {
  TopicAdminDetail,
  TopicAdminDetailWithLinkCount,
  TopicAdminSummary,
} from '@fphd/internal-api-features/contract';

/** Resolved on the server so a cookie value is only ever a key into copy written here. */
const FLASH_MESSAGES = {
  'topic-created': 'Topic created',
  'topic-updated': 'Topic updated',
  'topic-unchanged': 'No changes were made',
  'topic-deleted': 'Topic deleted',
} as const;

type FlashKey = keyof typeof FLASH_MESSAGES;

// `in` would also admit inherited keys like 'constructor', turning the lookup into a function.
function isFlashKey(value: string | undefined): value is FlashKey {
  return value !== undefined && Object.hasOwn(FLASH_MESSAGES, value);
}

function requireTopicId(params: LoaderFunctionArgs['params']): string {
  const id = topicIdSchema.safeParse(params.id);

  if (!id.success) throw new Response('Not Found', { status: 404 });

  return id.data;
}

export async function loadAdminTopics({ context }: LoaderFunctionArgs) {
  const topics = await context
    .get(apiContext)
    .get('/api/internal/topics', topicAdminSummaryListSchema);
  // Taken after the fetch, so a failed page load does not consume the message it would show.
  const flash = takeFlash(context);

  return {
    topics,
    notification: isFlashKey(flash) ? FLASH_MESSAGES[flash] : undefined,
  };
}

export async function loadAdminTopicToEdit({ context, params }: LoaderFunctionArgs) {
  const id = requireTopicId(params);
  const topic = await context
    .get(apiContext)
    .get(apiPath`/api/internal/topics/${id}`, topicAdminDetailWithLinkCountSchema);
  const flash = takeFlash(context);

  return {
    topic,
    notification: isFlashKey(flash) ? FLASH_MESSAGES[flash] : undefined,
  };
}

/** Shown when a save is refused because the topic changed after the page was shown. */
export const TOPIC_CHANGED =
  'Someone else has changed this topic since you opened this page. Your changes have not been saved. Select Save to save them and replace their changes.';

export interface SaveTopicFailure extends FormRefusal<TopicField> {
  values: TopicFormValues;
  /** On an edit, the version to save against next; see `versionedAction`. */
  version?: string;
}

/**
 * Redirects on success so a refresh does not re-submit; the outcome arrives as a flash. The
 * redirect is by id, so editing the slug leaves the publisher where they were. A topic changed
 * since the page showed it is not saved.
 */
export const saveTopic = versionedAction(
  async ({ context, params }, { formData, version }): Promise<SaveTopicFailure | Response> => {
    const id = requireTopicId(params);
    const submission = parseTopicForm(formData);

    if (!submission.ok) {
      return { values: readTopicForm(formData), fieldErrors: submission.fieldErrors };
    }

    const result = await context
      .get(apiContext)
      .put(
        apiPath`/api/internal/topics/${id}`,
        { ...submission.values, version },
        topicUpdateResponseSchema,
        topicUpdateErrorSchema,
      );

    if (!result.ok) {
      const values = readTopicForm(formData);

      return result.error.error === 'changed'
        ? { values, fieldErrors: {}, formError: TOPIC_CHANGED, version: result.error.version }
        : { values, ...formRefusal(result.error) };
    }

    setFlash(context, result.data.changed ? 'topic-updated' : 'topic-unchanged');

    return redirect(editTopicPath(id));
  },
);

/** Redirects to the new topic's edit page with a flash, the same shape as a save. */
export async function createTopic({
  context,
  request,
}: ActionFunctionArgs): Promise<SaveTopicFailure | Response> {
  const formData = await request.formData();
  const submission = parseTopicForm(formData);

  if (!submission.ok) {
    return { values: readTopicForm(formData), fieldErrors: submission.fieldErrors };
  }

  const result = await context
    .get(apiContext)
    .post(
      '/api/internal/topics',
      submission.values,
      topicCreateResponseSchema,
      topicUpdateErrorSchema,
    );

  if (!result.ok) {
    return { values: readTopicForm(formData), ...formRefusal(result.error) };
  }

  setFlash(context, 'topic-created');

  return redirect(editTopicPath(result.data.topic.id));
}

export async function loadAdminTopicToDelete({ context, params }: LoaderFunctionArgs) {
  const id = requireTopicId(params);

  return {
    topic: await context
      .get(apiContext)
      .get(apiPath`/api/internal/topics/${id}`, topicAdminDetailWithLinkCountSchema),
  };
}

/** Runs only from the confirmation page's POST; a topic linked since it loaded goes back there. */
export async function deleteTopic({ context, params }: ActionFunctionArgs): Promise<Response> {
  const id = requireTopicId(params);

  const result = await context
    .get(apiContext)
    .delete(apiPath`/api/internal/topics/${id}`, topicDeleteErrorSchema);

  if (!result.ok) return redirect(deleteTopicPath(id));

  setFlash(context, 'topic-deleted');

  return redirect(TOPICS_ADMIN_PATH);
}
