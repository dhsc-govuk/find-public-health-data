import { Markdown, TaskList } from '@fphd/ui';

import type { TaskGroup } from '../indicator-tasks.ts';
import { indicatorRevisionResponsePath } from '../publish-paths.ts';
import { StatusTag } from '../status-tag/status-tag.tsx';
import type {
  IndicatorTaskList,
  ReviewerComment,
  ReviewerRequest,
  ReviewerRequests,
} from './loader.ts';
import { taskItem } from './task-item.tsx';

/** What a reviewer wrote, inset as the task's hint, with who wrote it above. */
function ReviewerCommentHint({ reviewerName, notes }: ReviewerComment) {
  return (
    <div className="govuk-inset-text govuk-!-margin-top-2 govuk-!-margin-bottom-0 fphd-task-list__comment">
      <p className="govuk-body govuk-!-font-weight-bold govuk-!-margin-bottom-1">
        Comment from {reviewerName}:
      </p>
      <Markdown html={notes} />
    </div>
  );
}

function flagOf(requests: ReviewerRequests, key: string): ReviewerRequest | undefined {
  return (requests.flags as Partial<Record<string, ReviewerRequest>>)[key];
}

/** How a flagged task is tagged: the same on every update, and by the round on a new indicator. */
function revisionStatus(
  { isUpdate }: IndicatorTaskList,
  { advised }: ReviewerRequests,
): 'advised' | 'needed' | 'update' {
  if (isUpdate) return 'update';
  return advised ? 'advised' : 'needed';
}

interface ReviewTaskListProps {
  group: TaskGroup;
  taskList: IndicatorTaskList;
  requests: ReviewerRequests;
}

/**
 * One group of the task list while a round of review has sent the draft back: each task with
 * what the reviewer asked of it as its hint, a flagged task tagged until it is saved. The notes
 * for reviewers end with the publisher's reply to the round, as the prototype has it.
 */
export function ReviewTaskList({ group, taskList, requests }: ReviewTaskListProps) {
  const { id } = taskList.indicator;
  const items = group.tasks.map((row) => {
    const flag = flagOf(requests, row.key);
    const item = taskItem(row, taskList);
    return {
      ...item,
      // A flagged task always links to its page, even one an update has no change to publish for.
      href: flag === undefined ? item.href : row.path(id, taskList.tasks[row.key]),
      hint: flag === undefined ? undefined : <ReviewerCommentHint {...flag} />,
      status:
        flag === undefined || flag.cleared ? (
          item.status
        ) : (
          <StatusTag type="revision" status={revisionStatus(taskList, requests)} />
        ),
    };
  });
  const reply = {
    title: 'Response to revisions or clarifications',
    href: indicatorRevisionResponsePath(id),
    hint:
      requests.clarificationRequest === null ? undefined : (
        <ReviewerCommentHint {...requests.clarificationRequest} />
      ),
    status: taskList.isUpdate ? (
      <StatusTag type="update-task" status={requests.replied ? 'complete' : 'incomplete'} />
    ) : (
      <StatusTag type="task" status={requests.replied ? 'completed' : 'not_started'} />
    ),
  };

  return (
    <div>
      <h2 className="govuk-heading-m">{group.title}</h2>
      <TaskList id={group.id} items={group.id === 'reviewer-notes' ? [...items, reply] : items} />
    </div>
  );
}
