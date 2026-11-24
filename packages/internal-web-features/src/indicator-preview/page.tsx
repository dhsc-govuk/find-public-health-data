import { NotificationBanner } from '@fphd/ui';
import type { ReactNode } from 'react';

interface IndicatorPreviewPageProps {
  /** Whether the preview shows only the metadata, to a user who doesn't work on the indicator. */
  metadataOnly?: boolean;
  children: ReactNode;
}

/** The public indicator page, as a preview, under the banner that says it is one. */
export function IndicatorPreviewPage({
  metadataOnly = false,
  children,
}: IndicatorPreviewPageProps) {
  return (
    <>
      <NotificationBanner disableAutoFocus>
        <p className="govuk-body">
          {metadataOnly
            ? 'This is a preview of the indicator. Only metadata is visible as this indicator belongs to a team you are not in.'
            : 'This is a preview of the indicator'}
        </p>
      </NotificationBanner>
      {children}
    </>
  );
}
