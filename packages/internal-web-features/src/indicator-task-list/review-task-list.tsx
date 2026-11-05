import type { IndicatorTaskStatuses } from '@fphd/internal-api-features/contract';
import { Markdown, TaskList } from '@fphd/ui';

import type { TaskGroup } from '../indicator-tasks.ts';
import { indicatorRevisionResponsePath } from '../publish-paths.ts';
import { StatusTag } from '../status-tag/status-tag.tsx';
import type { ReviewerComment, ReviewerRequest, ReviewerRequests } from './loader.ts';

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

interface ReviewTaskListProps {
  id: string;
  group: TaskGroup;
  tasks: IndicatorTaskStatuses;
  requests: ReviewerRequests;
}

/**
 * One group of the task list while a round of review has sent the draft back: each task with
 * what the reviewer asked of it as its hint, a flagged task tagged until it is saved. The notes
 * for reviewers end with the publisher's reply to the round, as the prototype has it.
 */
export function ReviewTaskList({ id, group, tasks, requests }: ReviewTaskListProps) {
  const items = group.tasks.map(({ key, title, path }) => {
    const flag = flagOf(requests, key);
    return {
      title,
      href: path(id, tasks[key]),
      hint: flag === undefined ? undefined : <ReviewerCommentHint {...flag} />,
      status:
        flag === undefined || flag.cleared ? (
          <StatusTag type="task" status={tasks[key]} />
        ) : (
          <StatusTag type="revision" status={requests.advised ? 'advised' : 'needed'} />
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
    status: <StatusTag type="task" status={requests.replied ? 'completed' : 'not_started'} />,
  };

  return (
    <div>
      <h2 className="govuk-heading-m">{group.title}</h2>
      <TaskList id={group.id} items={group.id === 'reviewer-notes' ? [...items, reply] : items} />
    </div>
  );
}
