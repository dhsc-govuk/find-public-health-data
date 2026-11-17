import { A, formatDate, GridColumn, GridRow, SectionBreak, SummaryList } from '@fphd/ui';
import { CI_CONFIDENCE_LEVEL_LABELS } from '@fphd/utils/ci-confidence-level';
import { POLARITY_LABELS } from '@fphd/utils/polarity';
import { publicUpdateFrequency } from '@fphd/utils/update-frequency';
import { dimensionValues, periodCovered, recentTrend } from './data.ts';
import type {
  IndicatorObservation,
  IndicatorPageDetail,
  IndicatorProviderSource,
  IndicatorQuestion,
} from './loader.ts';
import { dataPlaceholder, isUnanswered, NOT_ENTERED_YET } from './placeholders.ts';
import { TrendTag } from './trend-tag.tsx';

export function DefinitionBlock({ title, text }: { title: string; text: string | null }) {
  if (!text) {
    return null;
  }

  return (
    <>
      <h4 className="govuk-heading-s">{title}</h4>
      <p className="govuk-body fphd-metadata-text">{text}</p>
    </>
  );
}

export function sourceLink(source: IndicatorPageDetail['dataSource']) {
  if (!source) {
    return null;
  }

  return source.url ? <A href={source.url}>{source.name}</A> : source.name;
}

// The original text stands in for the fixed label only: a reason the publisher had to give
// still follows it.
function UpdateFrequency({ indicator }: { indicator: IndicatorPageDetail }) {
  const description = indicator.updateFrequencyText;
  const fixed =
    indicator.updateFrequency &&
    publicUpdateFrequency(indicator.updateFrequency, indicator.updateFrequencyReason);
  if (description && !fixed?.reason) return <div className="fphd-metadata-text">{description}</div>;
  if (!fixed) return null;

  return (
    <>
      {description ? (
        <div className="fphd-metadata-text govuk-!-margin-bottom-2">{description}</div>
      ) : null}
      {fixed.text}
      {fixed.reason ? (
        <div className="fphd-metadata-text govuk-!-margin-top-2">{fixed.reason}</div>
      ) : null}
    </>
  );
}

function updateFrequencyRow(name: string, indicator: IndicatorPageDetail) {
  if (isUnanswered(indicator, 'updateFrequency')) return [{ name, children: NOT_ENTERED_YET }];
  return indicator.updateFrequencyText || indicator.updateFrequency
    ? [
        {
          name,
          children: <UpdateFrequency indicator={indicator} />,
        },
      ]
    : [];
}

export function IndicatorSummary({
  indicator,
  observations,
}: {
  indicator: IndicatorPageDetail;
  observations: IndicatorObservation[];
}) {
  const ofDimension = (dimension: string) =>
    indicator.classifications.filter((entry) => entry.dimension === dimension);
  const trend = recentTrend(observations, indicator.polarity);
  const placeholder = dataPlaceholder(indicator);
  const indicatorTypes = ofDimension('indicator_type');
  const lifeStages = ofDimension('life_stage');
  const frameworks = ofDimension('framework');
  const subtopics = indicator.topics.flatMap((topic) =>
    (topic.subtopics ?? []).map((subtopic) => ({ ...subtopic, topicSlug: topic.slug })),
  );

  return (
    <GridRow className="fphd-indicator-summary">
      <GridColumn width="one-half">
        <SummaryList
          items={[
            {
              name: 'Period covered',
              children:
                placeholder ?? (periodCovered(observations, indicator.yearType) || 'No data'),
            },
            ...(indicator.dataUpdatedAt
              ? [{ name: 'Last updated', children: formatDate(indicator.dataUpdatedAt, 'long') }]
              : []),
            ...updateFrequencyRow('Update frequency', indicator),
            ...(indicator.lastPublishedAt !== indicator.firstPublishedAt
              ? [{ name: 'Status', children: 'Updated' }]
              : []),
            {
              name: 'Trend (last 5 periods)',
              children: placeholder ?? <TrendTag trend={trend} />,
            },
          ]}
        />
      </GridColumn>
      <GridColumn width="one-half">
        <SummaryList
          items={[
            ...(indicator.topics.length > 0
              ? [
                  {
                    name: 'Topics',
                    children: (
                      <ul className="govuk-list fphd-tag-list">
                        {indicator.topics.map((topicItem) => (
                          <li className="fphd-tag" key={topicItem.slug}>
                            <A href={`/topics/${topicItem.slug}`}>{topicItem.title}</A>
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                ]
              : []),
            ...(subtopics.length > 0
              ? [
                  {
                    name: subtopics.length === 1 ? 'Subtopic' : 'Subtopics',
                    children: (
                      <ul className="govuk-list fphd-tag-list">
                        {subtopics.map(({ slug, title, topicSlug }) => (
                          <li className="fphd-tag" key={`${topicSlug}-${slug}`}>
                            <A
                              href={`/topics/${topicSlug}?${new URLSearchParams({ 'tab-topic': 'data', subtopic: slug })}`}
                            >
                              {title}
                            </A>
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                ]
              : []),
            ...(indicatorTypes.length > 0
              ? [
                  {
                    name: 'Indicator types',
                    children: (
                      <ul className="govuk-list fphd-tag-list">
                        {indicatorTypes.map((entry) => (
                          <li className="fphd-tag" key={entry.slug}>
                            {entry.name}
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                ]
              : []),
            ...(frameworks.length > 0
              ? [
                  {
                    name: 'Plans and programmes',
                    children: (
                      <ul className="govuk-list fphd-tag-list">
                        {frameworks.map((entry) => (
                          <li className="fphd-tag" key={entry.slug}>
                            {entry.name}
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                ]
              : []),
            ...(lifeStages.length > 0
              ? [
                  {
                    name: 'Life stages',
                    children: (
                      <ul className="govuk-list fphd-tag-list">
                        {lifeStages.map((entry) => (
                          <li className="fphd-tag" key={entry.slug}>
                            {entry.name}
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                ]
              : []),
            ...(indicator.definition
              ? [
                  {
                    name: 'Definition',
                    children: <span className="fphd-metadata-text">{indicator.definition}</span>,
                  },
                ]
              : []),
          ]}
        />
      </GridColumn>
    </GridRow>
  );
}

/** A provider alone where it has no specific source. */
function providerSourceLabel({ provider, source }: IndicatorProviderSource): string {
  return source === null ? provider : `${provider}: ${source}`;
}

function CalculationPart({
  title,
  explainer,
  sources,
  definition,
}: {
  title: string;
  explainer: string;
  sources: IndicatorProviderSource[];
  definition: string | null;
}) {
  if (sources.length === 0 && !definition) {
    return null;
  }

  return (
    <>
      <h3 className="govuk-heading-s govuk-!-margin-bottom-1">{title}</h3>
      <p className="govuk-body">{explainer}</p>
      <SummaryList
        items={[
          ...(sources.length > 0
            ? [
                {
                  name: `${title} sources`,
                  children: (
                    <ul className="govuk-list">
                      {sources.map((entry) => (
                        <li key={providerSourceLabel(entry)}>{providerSourceLabel(entry)}</li>
                      ))}
                    </ul>
                  ),
                },
              ]
            : []),
          ...(definition
            ? [
                {
                  name: `${title} definition`,
                  children: <span className="fphd-metadata-text">{definition}</span>,
                },
              ]
            : []),
        ]}
      />
    </>
  );
}

/** About tab: Overview, Data attributes, Calculation, Other notes, and History. */
export function BackgroundInformation({
  indicator,
  observations = [],
}: {
  indicator: IndicatorPageDetail;
  observations?: IndicatorObservation[];
}) {
  const confidenceLevel = indicator.ciConfidenceLevel
    ? CI_CONFIDENCE_LEVEL_LABELS[indicator.ciConfidenceLevel]
    : null;
  const attribute = (name: string, value: string | null) =>
    value ? [{ name, children: value }] : [];
  const answer = (name: string, question: IndicatorQuestion, value: string | null) =>
    attribute(name, isUnanswered(indicator, question) ? NOT_ENTERED_YET : value);
  const placeholder = dataPlaceholder(indicator);

  return (
    <section id={`background-${indicator.shortId}`}>
      <h2 className="govuk-heading-m">Overview</h2>
      <SummaryList
        items={[
          { name: 'Indicator ID', children: String(indicator.shortId) },
          ...(indicator.rationale
            ? [
                {
                  name: 'Rationale',
                  children: <span className="fphd-metadata-text">{indicator.rationale}</span>,
                },
              ]
            : []),
        ]}
      />

      <SectionBreak size="m" visible />

      <h2 className="govuk-heading-m">Data attributes</h2>
      <SummaryList
        items={[
          ...answer('Value type', 'valueType', indicator.valueType),
          ...answer('Unit', 'unit', indicator.unit),
          ...attribute('Ages', placeholder ?? dimensionValues(observations, 'Age').join(', ')),
          ...attribute(
            'Sex',
            placeholder ??
              (dimensionValues(observations, 'Sex').join(', ') ||
                (observations.length ? 'Persons' : null)),
          ),
          ...attribute('Year type', indicator.yearType?.label ?? null),
          ...updateFrequencyRow('Frequency', indicator),
          ...answer(
            'Polarity',
            'polarity',
            indicator.polarity === null ? null : POLARITY_LABELS[indicator.polarity],
          ),
          ...(indicator.dataSource
            ? [{ name: 'Data source', children: sourceLink(indicator.dataSource) }]
            : []),
        ]}
      />

      <SectionBreak size="m" visible />

      <h2 className="govuk-heading-m">Calculation</h2>
      <CalculationPart
        title="Numerator"
        explainer="This is the count, or raw number, of the thing an indicator measures."
        sources={indicator.numeratorSources}
        definition={indicator.numeratorDefinition}
      />
      <CalculationPart
        title="Denominator"
        explainer="This is the total eligible group an indicator covers."
        sources={indicator.denominatorSources}
        definition={indicator.denominatorDefinition}
      />
      {indicator.methodology ? (
        <>
          <h3 className="govuk-heading-s">Method</h3>
          <SummaryList
            items={[
              {
                name: 'How the indicator was calculated',
                children: <span className="fphd-metadata-text">{indicator.methodology}</span>,
              },
            ]}
          />
        </>
      ) : null}
      {indicator.ciMethod || confidenceLevel || indicator.comparatorMethod ? (
        <>
          <h3 className="govuk-heading-s">Confidence intervals</h3>
          <SummaryList
            items={[
              ...attribute('Confidence interval method', indicator.ciMethod),
              ...attribute('Confidence level', confidenceLevel),
              ...attribute('Benchmarking method', indicator.comparatorMethod),
            ]}
          />
        </>
      ) : null}

      {indicator.disclosureControl || indicator.notes || indicator.caveats ? (
        <>
          <SectionBreak size="m" visible />
          <h2 className="govuk-heading-m">Other notes and caveats</h2>
          <SummaryList
            items={[
              ...attribute('Disclosure control', indicator.disclosureControl),
              ...attribute('Notes', indicator.notes),
              ...attribute('Caveats', indicator.caveats),
            ].map((item) => ({
              ...item,
              children: <span className="fphd-metadata-text">{item.children}</span>,
            }))}
          />
        </>
      ) : null}

      {indicator.updateSummaries.length > 0 ? (
        <>
          <SectionBreak size="m" visible />
          <h2 className="govuk-heading-m">History</h2>
          <SummaryList
            items={indicator.updateSummaries.map(({ publishedAt, summary }) => ({
              name: formatDate(publishedAt, 'long'),
              children: <span className="fphd-metadata-text">{summary}</span>,
            }))}
          />
        </>
      ) : null}
    </section>
  );
}
