import type { IndicatorStatus } from '@fphd/internal-api-features/contract';
import { A, Button, PageIntro } from '@fphd/ui';

import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import { indicatorDiscardPath } from '../publish-paths.ts';

export const DISCARD_TITLE = 'Are you sure you want to discard this draft?';

interface DiscardPageProps {
  id: string;
  /** The draft's last edit, which the form names so no draft edited since is discarded. */
  draftUpdatedAt: string;
  indicatorStatus: IndicatorStatus;
}

export function IndicatorDiscardPage({ id, draftUpdatedAt, indicatorStatus }: DiscardPageProps) {
  return (
    <PageIntro title={DISCARD_TITLE}>
      <p className="govuk-body">
        {indicatorStatus === 'live'
          ? 'The changes in this draft will be deleted. The live indicator will stay as it is. You cannot undo this.'
          : 'This indicator will be deleted. You cannot undo this.'}
      </p>
      <form action={indicatorDiscardPath(id)} method="post">
        <input name="draftUpdatedAt" type="hidden" value={draftUpdatedAt} />
        <Button classModifiers="warning" type="submit">
          Discard draft
        </Button>
      </form>
      <p className="govuk-body">
        <A href={indicatorOverviewPath(id)}>Cancel</A>
      </p>
    </PageIntro>
  );
}
