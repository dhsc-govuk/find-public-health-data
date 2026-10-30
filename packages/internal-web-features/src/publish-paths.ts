import {
  DATA_TABLE_ROWS_PER_PAGE,
  type IndicatorTaskKey,
} from '@fphd/internal-api-features/contract';

/** The publishing journey, which is separate from the dashboard the indicators are listed on. */
const PUBLISH_PATH = '/publish';

export const NEW_INDICATOR_PATH = `${PUBLISH_PATH}/indicators/new`;

/** Where a publisher in several teams chooses the one a new indicator joins, before naming it. */
export const NEW_INDICATOR_TEAM_PATH = `${NEW_INDICATOR_PATH}/team`;

/** The name page of a new indicator that joins the team given. */
export function newIndicatorPath(teamId: string): string {
  return `${NEW_INDICATOR_PATH}?${new URLSearchParams({ team: teamId })}`;
}

function indicatorPublishPath(id: string, page: string): string {
  return `${PUBLISH_PATH}/indicators/${encodeURIComponent(id)}/${page}`;
}

export function indicatorTaskListPath(id: string): string {
  return indicatorPublishPath(id, 'task-list');
}

/** Where the task list posts to fill in the draft's remaining tasks with sample answers. */
export function indicatorSampleAnswersPath(id: string): string {
  return indicatorPublishPath(id, 'sample-answers');
}

/** The page that confirms withdrawing the draft's submission for approval. */
export function indicatorWithdrawalPath(id: string): string {
  return indicatorPublishPath(id, 'withdraw-submission');
}

/** Each section of a draft has a page, named by its task key. */
export function indicatorSectionPath(id: string, section: IndicatorTaskKey): string {
  return indicatorPublishPath(id, section);
}

/** The data table task's own page, where the file is uploaded. */
export function indicatorDataTablePath(id: string): string {
  return indicatorPublishPath(id, 'data-table');
}

/** Where a refused data table's problems are listed until a later upload loads. */
export function indicatorDataTableProblemsPath(id: string): string {
  return indicatorPublishPath(id, 'data-table/problems');
}

/** The page where the publisher checks and confirms an uploaded data table. */
export function indicatorDataTableCheckPath(
  id: string,
  { page = 1, rowsPerPage }: { page?: number; rowsPerPage?: number } = {},
): string {
  const query = new URLSearchParams({
    ...(page === 1 ? {} : { page: String(page) }),
    ...(rowsPerPage === undefined || String(rowsPerPage) === DATA_TABLE_ROWS_PER_PAGE[0]
      ? {}
      : { rowsPerPage: String(rowsPerPage) }),
  }).toString();
  return `${indicatorPublishPath(id, 'data-table/check')}${query === '' ? '' : `?${query}`}`;
}
