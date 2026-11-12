import type { TaskRow } from '../indicator-tasks.ts';
import { updateTaskStatus } from '../indicator-tasks.ts';
import { StatusTag } from '../status-tag/status-tag.tsx';
import type { IndicatorTaskList } from './loader.ts';

/**
 * A task as the task list shows it: its title, its page and its status. On an update, the status
 * reads against the live indicator, and the publishing date and the update summary are not links
 * until there is a change to publish.
 */
export function taskItem({ title, key, path }: TaskRow, taskList: IndicatorTaskList) {
  const { indicator, isUpdate, tasks } = taskList;

  if (!isUpdate) {
    return {
      title,
      href: path(indicator.id, tasks[key]),
      status: <StatusTag type="task" status={tasks[key]} />,
    };
  }

  const status = updateTaskStatus(taskList, key);
  return {
    title,
    href: status === 'no_changes' ? undefined : path(indicator.id, tasks[key]),
    status: <StatusTag type="update-task" status={status} />,
  };
}
