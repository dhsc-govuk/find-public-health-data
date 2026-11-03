import {
  Button,
  DocumentTitle,
  ErrorSummary,
  GridColumn,
  GridRow,
  InsetText,
  TaskList,
} from '@fphd/ui';

import { TASK_GROUPS } from '../indicator-tasks.ts';
import { indicatorSampleAnswersPath, indicatorTaskListPath } from '../publish-paths.ts';
import { IndicatorHeading } from '../status-tag/indicator-heading.tsx';
import { StatusTag } from '../status-tag/status-tag.tsx';
import type { IndicatorTaskList } from './loader.ts';

interface TaskListPageProps {
  taskList: IndicatorTaskList;
  /** True where a development tool may fill in the tasks left to do. */
  offersSampleAnswers?: boolean;
  /** Why the last submission was refused. */
  formError?: string | undefined;
}

/** Offered once every task is complete and the workflow lets the user submit the draft. */
function SubmitForm({ taskList }: { taskList: IndicatorTaskList }) {
  if (!taskList.canSubmit || !taskList.actions.includes('submit')) return null;

  return (
    <>
      <h2 className="govuk-heading-m govuk-!-margin-top-8">
        By continuing, you confirm that you have checked all data and metadata is correct.
      </h2>
      <form action={indicatorTaskListPath(taskList.indicator.id)} method="post">
        <input name="draftUpdatedAt" type="hidden" value={taskList.draftUpdatedAt} />
        <Button preventDoubleClick type="submit">
          Submit for approval
        </Button>
      </form>
    </>
  );
}

/** A development tool, so that the submit and review journeys can be tried without the typing. */
function SampleAnswersForm({ id }: { id: string }) {
  return (
    <form action={indicatorSampleAnswersPath(id)} method="post">
      <InsetText>
        This button is only in development environments. It replaces any answers to tasks not yet
        completed, and any data table not yet confirmed.
      </InsetText>
      <Button classModifiers="secondary" preventDoubleClick type="submit">
        Fill in the remaining tasks with sample answers
      </Button>
    </form>
  );
}

export function IndicatorTaskListPage({
  taskList,
  offersSampleAnswers = false,
  formError,
}: TaskListPageProps) {
  const { indicator, tasks } = taskList;

  return (
    <GridRow>
      <GridColumn width="two-thirds">
        <DocumentTitle hasErrors={formError !== undefined} pageTitle="Indicator task list" />
        <ErrorSummary errors={[]} formError={formError} />
        <IndicatorHeading indicator={indicator} />
        <InsetText>
          You can complete these sections in any order. If you exit at any point, any selections or
          text you've added will be saved.
        </InsetText>
        {TASK_GROUPS.map((group) => (
          <div key={group.id}>
            <h2 className="govuk-heading-m">{group.title}</h2>
            <TaskList
              id={group.id}
              items={group.tasks.map(({ key, path, title }) => ({
                title,
                href: path(indicator.id, tasks[key]),
                status: <StatusTag type="task" status={tasks[key]} />,
              }))}
            />
          </div>
        ))}
        {offersSampleAnswers && <SampleAnswersForm id={indicator.id} />}
        <SubmitForm taskList={taskList} />
      </GridColumn>
    </GridRow>
  );
}
