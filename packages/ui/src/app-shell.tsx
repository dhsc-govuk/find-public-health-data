import A from '@not-govuk/link';
import { GovUKPage } from '@not-govuk/page';
import type { ReactNode } from 'react';

export const serviceName = 'Find public health data';

const footerLinks = [
  { text: 'Help', href: '/help' },
  { text: 'Privacy', href: '/privacy' },
  { text: 'Cookies', href: '/cookies' },
  { text: 'Accessibility statement', href: '/accessibility' },
  { text: 'Contact', href: '/contact' },
  { text: 'Terms and conditions', href: '/terms' },
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
  navigation,
  serviceHref = '/',
}: AppShellProps) {
  const isInternal = audience === 'Internal';

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
        phase={isInternal ? 'Internal' : 'Alpha'}
        phaseBannerContent={
          isInternal ? (
            'This service is for authorised staff managing public health data.'
          ) : (
            <>
              This is a new service – your <A href="/feedback">feedback</A> will help us to improve
              it.
            </>
          )
        }
        serviceHref={serviceHref}
        serviceName={serviceName}
      >
        {children}
      </GovUKPage>
    </>
  );
}

interface EnvironmentBannerProps {
  audience: AppShellProps['audience'];
  environmentName: string;
}

/**
 * Tells people they are on a copy of the service used for testing, above the GOV.UK header. It
 * holds no links, so the skip link inside the page stays the first thing the keyboard reaches.
 */
function EnvironmentBanner({ audience, environmentName }: EnvironmentBannerProps) {
  return (
    <section
      aria-label="Environment"
      // The audience class gives the width container the same width as the page below.
      className={`govuk-phase-banner fphd-environment-banner fphd-app--${audience.toLowerCase()}`}
    >
      <div className="govuk-width-container">
        <p className="govuk-phase-banner__content">
          <strong className="govuk-tag govuk-phase-banner__content__tag">{environmentName}</strong>
          <span className="govuk-phase-banner__text">
            This version of {serviceName} is only used for testing. No changes will appear on the
            live site.
          </span>
        </p>
      </div>
    </section>
  );
}
