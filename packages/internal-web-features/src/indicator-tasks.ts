import {
  INDICATOR_TASK_TITLES,
  type IndicatorTaskKey,
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
      task('sex-and-ages'),
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
