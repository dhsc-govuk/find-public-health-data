import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useActionData, useLoaderData } from 'react-router';
import { loadAdminTopicToEdit, type SaveTopicFailure, saveTopic } from './loader.ts';
import { EditTopicPage } from './pages.tsx';
import { TOPICS_ADMIN_PATH } from './paths.ts';

export const loader = loadAdminTopicToEdit;
export const action = saveTopic;

export const meta = titleFromPage;

export const handle = backLinkHandle(TOPICS_ADMIN_PATH, 'Back to topics');

export function EditTopicRoute() {
  const { topic, notification } = useLoaderData<typeof loader>();
  // Set only when a save was rejected; the form then shows what was typed, not what is stored.
  const rejected = useActionData<SaveTopicFailure | undefined>();

  return (
    <EditTopicPage
      fieldErrors={rejected?.fieldErrors ?? {}}
      formError={rejected?.formError}
      linkedIndicatorCount={topic.linkedIndicatorCount}
      notification={notification}
      topicId={topic.id}
      values={rejected?.values ?? topic}
      version={rejected?.version ?? topic.version}
    />
  );
}

export default EditTopicRoute;
