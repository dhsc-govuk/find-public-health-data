import { indicatorOverviewPath } from '../indicator-overview/paths.ts';

/** The query parameter naming the page the preview was opened from, for its back link. */
export const PREVIEW_FROM_PARAM = 'from';

/** The pages a preview opens from: the task list, or by default the indicator's overview. */
export type PreviewOpenedFrom = 'task-list' | 'overview';

/** The preview of the indicator's draft or scheduled version, as the public page would show it. */
export function indicatorPreviewPath(id: string, from?: PreviewOpenedFrom): string {
  const path = `${indicatorOverviewPath(id)}/preview`;
  return from === 'task-list' ? `${path}?${PREVIEW_FROM_PARAM}=task-list` : path;
}
