import { backLinkHandle } from '@fphd/ui';

import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import { indicatorTaskListPath } from '../publish-paths.ts';
import type { IndicatorPreview } from './loader.ts';

/** The preview's back link, to the task list or the overview it was opened from. */
export const indicatorPreviewHandle = backLinkHandle<{ preview: IndicatorPreview }>(
  ({ preview }) =>
    preview.from === 'task-list'
      ? indicatorTaskListPath(preview.id)
      : indicatorOverviewPath(preview.id),
  ({ preview }) =>
    preview.from === 'task-list' ? 'Back to task list' : 'Back to indicator overview',
);
