import type { TopicDetail } from '@fphd/public-api-features/contract';

const OHID_STATISTICS_URL =
  'https://www.gov.uk/search/research-and-statistics?content_store_document_type=upcoming_statistics&organisations[]=office-for-health-improvement-and-disparities&order=release-date-oldest';

export function TopicMoreInformation({ content }: { content: TopicDetail['content'] }) {
  if (!content) {
    return (
      <div className="fphd-topic-more-information">
        <p className="govuk-body">
          Find upcoming official statistics releases about public health data on GOV.UK.
        </p>
        <ul className="govuk-list govuk-list--bullet">
          <li>
            <a className="govuk-link" href={OHID_STATISTICS_URL}>
              Release calendar for the Office for Health Improvement and Disparities
            </a>
          </li>
        </ul>
      </div>
    );
  }
  const { intro, sections } = content.moreInformation;
  return (
    <div className="fphd-topic-more-information">
      <p className="govuk-body">{intro}</p>
      {sections.map((section) => (
        <section key={section.heading}>
          <h2 className="govuk-heading-m">{section.heading}</h2>
          <ul className="govuk-list govuk-list--bullet">
            {section.links.map(({ label, url, note }) => (
              <li key={url}>
                <a className="govuk-link" href={url}>
                  {label}
                </a>
                {note ? ` (${note})` : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
