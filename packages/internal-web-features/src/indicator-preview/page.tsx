import { NotificationBanner } from '@fphd/ui';
import type { ReactNode } from 'react';

/** The public indicator page, as a preview, under the banner that says it is one. */
export function IndicatorPreviewPage({ children }: { children: ReactNode }) {
  return (
    <>
      <NotificationBanner disableAutoFocus>
        <p className="govuk-body">This is a preview of the indicator</p>
      </NotificationBanner>
      {children}
    </>
  );
}
