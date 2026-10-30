import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useActionData, useLoaderData } from 'react-router';

import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import { loadIndicatorTaskList, type SubmitRefusal, submitIndicator } from './loader.ts';
import { IndicatorTaskListPage } from './page.tsx';

export const loader = loadIndicatorTaskList;

export const action = submitIndicator;

export const meta = titleFromPage;

export const handle = backLinkHandle<Awaited<ReturnType<typeof loader>>>(
  ({ taskList }) => indicatorOverviewPath(taskList.indicator.id),
  'Back to indicator overview',
);

export function IndicatorTaskListRoute() {
  const { taskList, offersSampleAnswers } = useLoaderData<typeof loader>();
  const refused = useActionData<SubmitRefusal | undefined>();

  return (
    <IndicatorTaskListPage
      taskList={taskList}
      offersSampleAnswers={offersSampleAnswers}
      formError={refused?.formError}
    />
  );
}

export default IndicatorTaskListRoute;
