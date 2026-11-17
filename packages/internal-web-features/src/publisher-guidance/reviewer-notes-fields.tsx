import { Example, type FieldGuidance, FieldGuidanceTable } from './guidance-table.tsx';

/** The questions on the notes for reviewers pages, which only the reviewers read. */
const REVIEWER_NOTES_FIELDS: readonly FieldGuidance[] = [
  {
    anchor: 'variation',
    header: 'How does the indicator vary?',
    guidance: (
      <>
        <p className="govuk-body">
          An indicator should ideally show significant differences across different geographic areas
          or segmentations. If it does not, there needs to be a very strong justification for
          publishing it.
        </p>
        <p className="govuk-body">
          You should provide a high-level summary of how indicator values vary between areas and
          groups over time. Or provide a justification for publication if they do not vary.
        </p>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            There are a sufficient number of local authorities in the latest data for 2025 that have
            values that are significantly different to England:
          </p>
          <ul className="govuk-list govuk-list--bullet">
            <li>89 (25.7%) are significantly higher</li>
            <li>112 (32.4%) are significantly lower</li>
            <li>145 (41.9%) are not significantly different</li>
          </ul>
        </Example>
      </>
    ),
  },
  {
    anchor: 'quality-assurance',
    header: 'What quality assurance has been done on the indicator?',
    guidance: (
      <>
        <p className="govuk-body">
          What quality assurance has been done and by whom? This either relates to the:
        </p>
        <ul className="govuk-list govuk-list--bullet">
          <li>direct calculation of the indicator values</li>
          <li>accurate transfer of indicator values from another source</li>
        </ul>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            Independent quality assurance has been done by [person name], using [software used].
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'data-quality-issues',
    header: 'If there are any data quality issues, what is being done to improve the quality?',
    guidance: (
      <>
        <p className="govuk-body">Anything the reviewers should know about:</p>
        <ul className="govuk-list govuk-list--bullet">
          <li>issues with source data</li>
          <li>
            what is in place to improve the quality of the source data, such as improved collection
            or recording processes
          </li>
        </ul>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            The following issues have been identified in the source data: [issue, who identified the
            issue (DHSC/source organisation), plans to improve (including any details of discussions
            with external organisations)]
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'ci-method-justification',
    header: 'Why was the confidence interval method chosen?',
    guidance: (
      <>
        <p className="govuk-body">
          Explain why the chosen method was appropriate. This could include details such as any
          assumptions made about the distribution of indicator values.
        </p>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            The [method name] is the standard method for producing confidence intervals for
            [indicator type].
          </p>
          <p className="govuk-body">Or:</p>
          <p className="govuk-body">
            There is no standard method for [indicator type or situation e.g. non-independence of
            numerator events]. The confidence interval method has been decided in consultation with
            [technical group or person’s name]
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'data-sources-justification',
    header: 'Why were the data sources chosen?',
    guidance: (
      <>
        <p className="govuk-body">
          Why were the numerator and denominator sources selected? Were any alternative sources
          considered?
        </p>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            The source was chosen because it has [e.g. data for all the required geographies, more
            robust data collection method, etc]
          </p>
          <p className="govuk-body">
            Other sources were considered. These were: [source], [reason for rejection]
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'inequalities',
    header: 'What health inequalities have been included?',
    guidance: (
      <>
        <p className="govuk-body">
          Detail the health inequalities dimensions included in the indicator. Explain whether they
          are available at local level or national level.
        </p>
        <p className="govuk-body">
          Also detail any inequalities dimensions that were considered for inclusion but rejected
          due to data quality or other considerations.
        </p>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            Inequalities breakdowns are provided at national level by LSOA-based deprivation decile
            and age group, and at national and local authority level by sex. A national breakdown by
            ethnicity was considered but not possible due to a lack of unsuppressed population
            denominators.
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'exclusions',
    header: 'If there have been any exclusions',
    guidance: (
      <>
        <p className="govuk-body">
          If certain groups or procedures have been excluded, explain why this was done. This could
          include people with certain personal characteristics or complications. Explain why
          included groups have been included.
        </p>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            The following groups have been excluded from the indicator data: [group excluded, reason
            for exclusion, whether this exclusion was in the source data or decided by internal
            analyst team]
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'automation-tools',
    header: 'If any internal automation tools have been used to create this indicator',
    guidance: (
      <>
        <p className="govuk-body">
          Outline the use of internal automation tools for this indicator. This could include, among
          others, use of:
        </p>
        <ul className="govuk-list govuk-list--bullet">
          <li>Centralised Indicator Automation (CIA)</li>
          <li>internal packages for extraction of data, such as DataLakeR</li>
          <li>tools for calculations like standardised rates, such as PHEindicatormethods</li>
        </ul>
        <p className="govuk-body">
          If you have not used any automation tools, you will need to explain why not.
        </p>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            The analysis used the DataLakeR package to extract data from the Data Lake into the R
            environment. The phe_dsr function in the PHEindicatormethods package was used to
            calculate directly standardised rates using the European Standard Population. As the
            indicator numerator uses a data source which is not available within CIA, it was not
            possible to use this here.
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'sponsors-and-stakeholders',
    header: 'Enter any applicable sponsors or stakeholders for this indicator',
    guidance: (
      <>
        <p className="govuk-body">
          Individual or post with policy responsibility for the area requesting or requiring the
          indicator. Or any stakeholders consulted in the development of the indicator.
        </p>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            Requested by [person name, job title, team] for the purposes of monitoring [relevant
            policy name].
          </p>
          <p className="govuk-body">[Optional: indicator was developed in consultation with …]</p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'reviewer-comments',
    header: 'Are there any other comments for the reviewers?',
    guidance: (
      <>
        <p className="govuk-body">
          Any other information that would be useful for reviewers that has not been included in any
          other metadata field.
        </p>
      </>
    ),
  },
];

export function ReviewerNotesFields() {
  return <FieldGuidanceTable fields={REVIEWER_NOTES_FIELDS} labelledBy="notes-for-reviewers" />;
}
