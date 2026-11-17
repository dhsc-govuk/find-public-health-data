import { serviceName } from './service-name.ts';

interface EnvironmentBannerProps {
  audience: 'Public' | 'Internal';
  environmentName: string;
}

/**
 * Tells people they are on a copy of the service used for testing, above the GOV.UK header. It
 * holds no links, so the skip link inside the page stays the first thing the keyboard reaches.
 */
export function EnvironmentBanner({ audience, environmentName }: EnvironmentBannerProps) {
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
