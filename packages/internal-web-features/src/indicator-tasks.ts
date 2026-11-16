import {
  INDICATOR_TASK_TITLES,
  type IndicatorTaskKey,
  type IndicatorTaskList,
  type IndicatorTaskStatus,
} from '@fphd/internal-api-features/contract';

import {
  indicatorDataTableCheckPath,
  indicatorDataTablePath,
  indicatorSectionPath,
} from './publish-paths.ts';

export interface TaskRow {
  key: IndicatorTaskKey;
  title: string;
  /** The page for doing the task, which can depend on the task's status. */
  path: (id: string, status: IndicatorTaskStatus) => string;
}

export interface TaskGroup {
  id: string;
  title: string;
  tasks: readonly TaskRow[];
}

function sectionPath(section: IndicatorTaskKey) {
  return (id: string) => indicatorSectionPath(id, section);
}

/** Once a file has been uploaded, the task links to the check page. */
function dataTablePath(id: string, status: IndicatorTaskStatus): string {
  return status === 'not_started' ? indicatorDataTablePath(id) : indicatorDataTableCheckPath(id);
}

function task(key: IndicatorTaskKey, path: TaskRow['path'] = sectionPath(key)): TaskRow {
  return { key, title: INDICATOR_TASK_TITLES[key], path };
}

/**
 * Every task a publisher completes, grouped as the publishing journey asks for them, which the
 * task list and the reviewer's revisions page both follow.
 */
export const TASK_GROUPS: readonly TaskGroup[] = [
  {
    id: 'data',
    title: 'Data',
    tasks: [
      task('data-table', dataTablePath),
      task('value-type-and-units'),
      task('sex-gender-and-ethnicity'),
      task('ages'),
      task('period-type'),
      task('polarity'),
      task('data-quality'),
    ],
  },
  {
    id: 'metadata',
    title: 'Metadata',
    tasks: [
      task('name'),
      task('definition-and-rationale'),
      task('numerator'),
      task('denominator'),
      task('calculation'),
      task('confidence-intervals'),
      task('benchmarking'),
      task('other-notes-and-caveats'),
      task('tagging'),
      task('copyright-and-data-reuse'),
    ],
  },
  {
    id: 'publishing',
    title: 'Publishing',
    tasks: [task('update-frequency'), task('publishing-date')],
  },
  {
    id: 'reviewer-notes',
    title: 'Notes for reviewers (not visible to consumers)',
    tasks: [task('variance-and-quality'), task('justifications'), task('other-comments')],
  },
];

/** The task list's groups for a draft: an update's Publishing group ends with its summary. */
export function taskGroups(isUpdate: boolean): readonly TaskGroup[] {
  if (!isUpdate) return TASK_GROUPS;

  return TASK_GROUPS.map((group) =>
    group.id === 'publishing'
      ? { ...group, tasks: [...group.tasks, task('update-summary')] }
      : group,
  );
}

/** Where a task on an update stands, as the update's task list shows it. */
export type UpdateTaskStatus = 'changed' | 'unchanged' | 'no_changes' | 'incomplete' | 'complete';

/** The tasks every update answers afresh, which wait until the update changes something else. */
const PUBLISHING_TASKS: readonly IndicatorTaskKey[] = ['publishing-date', 'update-summary'];

/**
 * Where a task on an update stands. Each task reads changed or unchanged against the live
 * indicator, or incomplete while its answers would not let the update be submitted, as a
 * section the live indicator left unanswered would not. The publishing date and the update
 * summary have nothing to publish until another task changes, and then are complete once their
 * answers are.
 */
export function updateTaskStatus(
  { tasks, changedTasks }: Pick<IndicatorTaskList, 'tasks' | 'changedTasks'>,
  key: IndicatorTaskKey,
): UpdateTaskStatus {
  if (!PUBLISHING_TASKS.includes(key)) {
    if (tasks[key] !== 'completed') return 'incomplete';
    return changedTasks.includes(key) ? 'changed' : 'unchanged';
  }
  if (changedTasks.length === 0) return 'no_changes';
  return tasks[key] === 'completed' ? 'complete' : 'incomplete';
}
