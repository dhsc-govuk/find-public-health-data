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
import type { IndicatorTaskList, ReviewerRequests } from './loader.ts';
import { ReviewTaskList } from './review-task-list.tsx';

interface TaskListPageProps {
  taskList: IndicatorTaskList;
  /** What the round of review that sent the draft back asks, shown below each task it flagged. */
  requests?: ReviewerRequests | null;
  /** True where a development tool may fill in the tasks left to do. */
  offersSampleAnswers?: boolean;
  /** Why the last submission was refused. */
  formError?: string | undefined;
}

/**
 * Offered once the workflow lets the user submit or resubmit the draft and the step would pass:
 * every task complete and, for a draft sent back, every flagged task saved and the reply written.
 */
function SubmitForm({ taskList }: { taskList: IndicatorTaskList }) {
  const offered = taskList.actions.includes('submit') || taskList.actions.includes('resubmit');
  if (!taskList.canSubmit || !offered) return null;

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
  requests = null,
  offersSampleAnswers = false,
  formError,
}: TaskListPageProps) {
  const { indicator, tasks } = taskList;

  return (
    <GridRow>
      <GridColumn width={requests === null ? 'two-thirds' : 'three-quarters'}>
        <DocumentTitle hasErrors={formError !== undefined} pageTitle="Indicator task list" />
        <ErrorSummary errors={[]} formError={formError} />
        <IndicatorHeading indicator={indicator} />
        <InsetText>
          You can complete these sections in any order. If you exit at any point, any section you
          have completed will be saved.
        </InsetText>
        {TASK_GROUPS.map((group) =>
          requests === null ? (
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
          ) : (
            <ReviewTaskList
              group={group}
              id={indicator.id}
              key={group.id}
              requests={requests}
              tasks={tasks}
            />
          ),
        )}
        {offersSampleAnswers && <SampleAnswersForm id={indicator.id} />}
        <SubmitForm taskList={taskList} />
      </GridColumn>
    </GridRow>
  );
}
