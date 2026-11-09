import { A, formatDate, GridColumn, GridRow, SectionBreak, SummaryList } from '@fphd/ui';
import { CI_CONFIDENCE_LEVEL_LABELS } from '@fphd/utils/ci-confidence-level';
import { POLARITY_LABELS } from '@fphd/utils/polarity';
import { UPDATE_FREQUENCY_LABELS } from '@fphd/utils/update-frequency';
import { dimensionValues, periodCovered, recentTrend } from './data.ts';
import type { IndicatorDetail, IndicatorObservation, IndicatorProviderSource } from './loader.ts';
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

export function sourceLink(source: IndicatorDetail['dataSource']) {
  if (!source) {
    return null;
  }

  return source.url ? <A href={source.url}>{source.name}</A> : source.name;
}

export function IndicatorSummary({
  indicator,
  observations,
}: {
  indicator: IndicatorDetail;
  observations: IndicatorObservation[];
}) {
  const ofDimension = (dimension: string) =>
    indicator.classifications.filter((entry) => entry.dimension === dimension);
  const trend = recentTrend(observations, indicator.polarity);
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
              children: periodCovered(observations, indicator.yearType) || 'No data',
            },
            ...(indicator.dataUpdatedAt
              ? [{ name: 'Last updated', children: formatDate(indicator.dataUpdatedAt, 'long') }]
              : []),
            {
              name: 'Update frequency',
              children: UPDATE_FREQUENCY_LABELS[indicator.updateFrequency],
            },
            ...(indicator.lastPublishedAt !== indicator.firstPublishedAt
              ? [{ name: 'Status', children: 'Updated' }]
              : []),
            { name: 'Trend (last 5 periods)', children: <TrendTag trend={trend} /> },
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

/** About tab: Overview, Data attributes, Calculation, Other notes. */
export function BackgroundInformation({
  indicator,
  observations = [],
}: {
  indicator: IndicatorDetail;
  observations?: IndicatorObservation[];
}) {
  const confidenceLevel = indicator.ciConfidenceLevel
    ? CI_CONFIDENCE_LEVEL_LABELS[indicator.ciConfidenceLevel]
    : null;
  const attribute = (name: string, value: string | null) =>
    value ? [{ name, children: value }] : [];

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
          ...attribute('Value type', indicator.valueType),
          ...attribute('Unit', indicator.unit),
          ...attribute('Ages', dimensionValues(observations, 'Age').join(', ')),
          ...attribute(
            'Sex',
            dimensionValues(observations, 'Sex').join(', ') ||
              (observations.length ? 'Persons' : null),
          ),
          ...attribute('Year type', indicator.yearType?.label ?? null),
          ...attribute('Frequency', UPDATE_FREQUENCY_LABELS[indicator.updateFrequency]),
          ...attribute('Polarity', POLARITY_LABELS[indicator.polarity]),
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
    </section>
  );
}
