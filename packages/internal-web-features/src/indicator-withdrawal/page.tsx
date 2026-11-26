import { A, Button, PageIntro } from '@fphd/ui';

import { indicatorOverviewPath } from '../indicator-overview/paths.ts';
import { indicatorWithdrawalPath } from '../publish-paths.ts';

interface WithdrawalPageProps {
  id: string;
  /** The submission the page asks about, which the form names so no newer one is withdrawn. */
  submissionNumber: number;
}

export function IndicatorWithdrawalPage({ id, submissionNumber }: WithdrawalPageProps) {
  return (
    <PageIntro title="Are you sure you want to withdraw this submission?">
      <p className="govuk-body">
        The indicator will return to draft and must be submitted again for approval.
      </p>
      <form action={indicatorWithdrawalPath(id)} method="post">
        <input name="submissionNumber" type="hidden" value={submissionNumber} />
        <Button classModifiers="warning" type="submit">
          Withdraw submission
        </Button>
      </form>
      <p className="govuk-body">
        <A href={indicatorOverviewPath(id)}>Cancel</A>
      </p>
    </PageIntro>
  );
}
