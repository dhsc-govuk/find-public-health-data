import A from '@not-govuk/link';
import { GovUKPage } from '@not-govuk/page';
import type { ReactNode } from 'react';

import { EnvironmentBanner } from './environment-banner.tsx';
import { serviceName } from './service-name.ts';

const footerLinks = [
  {
    text: 'Government Digital Service',
    href: 'https://www.gov.uk/government/organisations/government-digital-service',
  },
];

export interface AppNavigationItem {
  href: string;
  text: string;
}

interface AppShellProps {
  audience: 'Public' | 'Internal';
  /** Where the back link above the main content goes, as GOV.UK places it. */
  backHref?: string | undefined;
  /** What that link says; without it Page names it "Back". */
  backText?: string | undefined;
  children: ReactNode;
  /** The environment the banner above the header names. The live service has none. */
  environmentName?: string | undefined;
  /** The address the phase banner asks for feedback at. Without it, the banner says "emailing us". */
  feedbackMailbox?: string | undefined;
  navigation: AppNavigationItem[];
  /** Where the service name in the header links to. */
  serviceHref?: string | undefined;
}

export function AppShell({
  audience,
  backHref,
  backText,
  children,
  environmentName,
  feedbackMailbox,
  navigation,
  serviceHref = '/',
}: AppShellProps) {
  return (
    <>
      {environmentName === undefined ? null : (
        <EnvironmentBanner audience={audience} environmentName={environmentName} />
      )}
      <GovUKPage
        backHref={backHref}
        backText={backText}
        // Lands on the page element only, so the stylesheet can size each app's frame.
        className={`fphd-app--${audience.toLowerCase()}`}
        meta={footerLinks}
        navigation={navigation}
        phase="Beta"
        phaseBannerContent={
          <>
            This is a new service. You can help us to improve it by emailing{' '}
            {feedbackMailbox === undefined ? (
              'us'
            ) : (
              <A href={`mailto:${feedbackMailbox}`}>{feedbackMailbox}</A>
            )}
            .
          </>
        }
        serviceHref={serviceHref}
        serviceName={serviceName}
      >
        {children}
      </GovUKPage>
    </>
  );
}
