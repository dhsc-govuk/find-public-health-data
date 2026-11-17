import { A } from '@fphd/ui';

import { Example, type FieldGuidance, FieldGuidanceTable } from './guidance-table.tsx';

const MANDATORY_FIELDS: readonly FieldGuidance[] = [
  {
    anchor: 'sex-gender-and-ethnicity',
    header: 'Sex, gender and ethnicity',
    guidance: (
      <>
        <p className="govuk-body">
          If gender was collected for the indicator rather than sex, ensure you select the correct
          option.
        </p>
      </>
    ),
  },
  {
    anchor: 'name',
    header: 'Name',
    guidance: (
      <>
        <p className="govuk-body">A good indicator name is:</p>
        <ul className="govuk-list govuk-list--bullet">
          <li>concise - try to keep to 15 words or fewer</li>
          <li>distinct - it should be easy to distinguish it from other indicators</li>
          <li>
            understandable to a general audience - do not use words or acronyms only specialists
            would understand
          </li>
          <li>written in sentence case – only the first word is capitalised</li>
        </ul>
        <p className="govuk-body">Try to include:</p>
        <ul className="govuk-list govuk-list--bullet">
          <li>
            units, such as percentage or rate per 100,000, as part of an understandable sentence
          </li>
          <li>
            demographic covered such as ‘Females, under 18’ - be as specific as possible, rather
            than just ‘children’ or ‘older people’
          </li>
        </ul>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">Percentage of GP patients aged 17 and over with diabetes</p>
        </Example>
        <Example>
          <p className="govuk-body">
            Killed and seriously injured casualties on England's roads, per billion vehicle miles
          </p>
        </Example>
        <Example>
          <p className="govuk-body">
            Mortality rate from respiratory disease for under 75s, per 100,000 people
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'definition',
    header: 'Definition',
    guidance: (
      <>
        <ul className="govuk-list govuk-list--bullet">
          <li>A more detailed description of the indicator than the name</li>
          <li>Include detail not possible to include in the name</li>
          <li>
            By reading this definition, any consumer should be able to understand what the indicator
            shows
          </li>
          <li>Do not include any methodology</li>
        </ul>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            The percentage of patients aged 17 or over with diabetes mellitus, as recorded on
            general practice disease registers. Recorded as part of the Quality and Outcomes
            Framework (QOF).
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'rationale',
    header: 'Rationale',
    guidance: (
      <>
        <p className="govuk-body">
          A short explanation why this particular indicator is useful or important. This should be
          specific to the indicator, not just the wider topics the indicator sits in.
        </p>
        <p className="govuk-body">This can include any:</p>
        <ul className="govuk-list govuk-list--bullet">
          <li>questions it addresses</li>
          <li>public health outcomes or changes it could inform</li>
          <li>
            general policy need it addresses - try to avoid using specific policy names as these can
            easily become out of date
          </li>
        </ul>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            Diabetes mellitus is a common disease that affects all age groups. Over 3 million people
            in the UK have the condition. Knowledge of how prevalent the disease is can help better
            monitor and manage it, reducing ill health and death.
          </p>
          <p className="govuk-body">
            This management and monitoring is primarily done by GP and primary care professionals.
            This is why general practices collect the data for this indicator, as part of the{' '}
            <A href="https://digital.nhs.uk/data-and-information/publications/statistical/quality-and-outcomes-framework-achievement-prevalence-and-exceptions-data">
              Quality and Outcomes Framework
            </A>
            .
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'numerator',
    header: 'Numerator (or equivalent) definition',
    guidance: (
      <>
        <ul className="govuk-list govuk-list--bullet">
          <li>For most indicators, this describes the thing an indicator is measuring</li>
          <li>It should be clear enough that anyone can understand it</li>
          <li>
            Someone with the appropriate expertise should be able to use the definition to reproduce
            the same values from the source data
          </li>
        </ul>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            Number of patients registered with a general practice, aged 17 or over with diabetes
            mellitus.
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'denominator',
    header: 'Denominator (or equivalent) definition',
    guidance: (
      <>
        <ul className="govuk-list govuk-list--bullet">
          <li>For most indicators, this describes the total eligible group the indicator covers</li>
          <li>It should be clear enough that anyone can understand it</li>
          <li>
            Someone with the appropriate expertise should be able to use the definition to reproduce
            the same values from the source data
          </li>
          <li>
            If the denominator is an expected value, you should include how the expected values were
            calculated - for example, for a standardised mortality ratio
          </li>
        </ul>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            Total number of patients registered with a general practice, aged 17 or over.
          </p>
        </Example>
      </>
    ),
  },
];

const DEPENDENT_FIELDS: readonly FieldGuidance[] = [
  {
    anchor: 'non-standard-calculation-method',
    header: 'Non-standard indicator calculation method',
    guidance: (
      <>
        <p className="govuk-body">
          This is only if a calculation method was used that is different to the standard method
          description for the indicator’s value type and indicator format.
        </p>
        <p className="govuk-body">
          Explain how the indicator has been calculated. Include any variations in the method used
          for different segmentations.
        </p>
        <p className="govuk-body">If the indicator:</p>
        <ul className="govuk-list govuk-list--bullet">
          <li>is standardised or adjusted, explain the reasoning and the methodology used</li>
          <li>
            is sourced from elsewhere and not calculated by OHID, explain the methodology to the
            best of your knowledge
          </li>
          <li>
            uses attributable fractions, describe them and link to where they can be accessed from
          </li>
        </ul>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            Numerator values for each age band are divided by the denominator population values for
            each age band. Giving age specific death rates.
          </p>
          <p className="govuk-body">
            These age specific rates are then multiplied by the standard population for each age
            group. Then aggregated across all the age groups to give the age adjusted count of
            deaths.
          </p>
          <p className="govuk-body">
            This age adjusted count of deaths is divided by the total standard population for the
            whole age range included in the indicator, and multiplied by 100,000. Giving the age
            standardised mortality rate.
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'disclosure-control',
    header: 'Disclosure control',
    guidance: (
      <>
        <p className="govuk-body">
          Disclosure controls are methods used to ensure nobody can identify a real person from
          indicator data.
        </p>
        <p className="govuk-body">
          This should be a clear description of any disclosure control processes that have been
          applied. Such as suppression of small numbers.
        </p>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            No data is presented for Isles of Scilly and City of London to prevent disclosure of
            small numbers. The estimates for Cornwall and Hackney local authorities are combined
            data for Cornwall and Isles of Scilly, and City of London and Hackney respectively.
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'other-organisations',
    header: 'Other organisations who calculated the indicator',
    guidance: (
      <>
        <p className="govuk-body">
          This is only if the indicator is not calculated by OHID or DHSC, but taken from somewhere
          else. Provide details and include links, as appropriate. If you include links, style them
          as per the ‘Formatting text with markdown’ section of this guidance.
        </p>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">Department for Environment, Food and Rural Affairs (DEFRA).</p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'other-or-modified-ci-method',
    header: 'Other or modified confidence interval method',
    guidance: (
      <>
        <p className="govuk-body">
          A clear description of the non-standard confidence interval method used. Include
          references and inline web links as appropriate.
        </p>
        <p className="govuk-body">OR</p>
        <p className="govuk-body">
          If a standard method has been used with modification, explain the modification used. You
          do not need to restate any detail covered by the standard definition for this method.
        </p>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            Confidence intervals were calculated by simulation. Simulation is a method used to
            estimate the degree of uncertainty for a measure. It’s used when the statistical
            distributions related to a measure are too complex to analyse mathematically.
          </p>
          <p className="govuk-body">
            For each decile, the healthy life expectancy (HLE) has been calculated along with its
            standard error (SE). These SEs give information about the degree of uncertainty around
            each of the healthy life expectancy values. This gives a range, or distribution, of
            possible values for each decile. Using a random number generating algorithm, a random
            value is taken from each decile distribution and the slope index of inequality (SII) is
            recalculated from that random value.
          </p>
          <p className="govuk-body">
            This is repeated many times (1,000,000), to build up a distribution of SII values based
            on random sampling from the decile HLE distributions. The 2.5% and 97.5% values from
            this distribution of SII values is then reported as the 95% confidence interval for the
            SII.
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'policy-goal',
    header: 'Policy goal explanation',
    guidance: (
      <>
        <p className="govuk-body">
          If any policy goal benchmarks are included, provide a clear description of what the goals
          are.
        </p>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            Local authorities should be working towards a chlamydia detection rate of at least 3,250
            diagnoses per 100,000 young women aged 15 to 24 years.
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'caveats',
    header: 'Caveats',
    guidance: (
      <>
        <p className="govuk-body">This should include detail of any:</p>
        <ul className="govuk-list govuk-list--bullet">
          <li>data quality issues, including missing, incomplete or under-reported data</li>
          <li>coverage limitations, including populations, settings or records excluded</li>
          <li>
            geographical limitations, including allocation issues, boundary differences or estimated
            geographies
          </li>
          <li>
            comparability issues, including areas, groups or time periods that should not be
            directly compared
          </li>
          <li>
            changes over time, including breaks caused by changes in source, collection, coding or
            definitions
          </li>
          <li>
            methodological limitations, including assumptions or estimations affecting
            interpretation
          </li>
          <li>small numbers or uncertainty in results that need particular caution</li>
          <li>source-specific issues identified by the data provider</li>
          <li>other issue that could cause a user to misinterpret a value</li>
        </ul>
      </>
    ),
    examples: (
      <>
        <Example>
          <p className="govuk-body">
            Registering as blind or partially sighted is voluntary. Therefore, this indicator may
            not be interpreted as a measure of the total prevalence of visual impairments.
          </p>
        </Example>
      </>
    ),
  },
  {
    anchor: 'interpretation-notes',
    header: 'Additional interpretation notes',
    guidance: (
      <>
        <p className="govuk-body">
          Anything else the consumer should know about how to interpret the data in the indicator
          that is not covered by any other metadata field. This may include rounding applied at any
          point to the data.
        </p>
      </>
    ),
  },
];

export function MandatoryFields() {
  return (
    <FieldGuidanceTable
      exampleHeading="Examples"
      fields={MANDATORY_FIELDS}
      labelledBy="mandatory-fields"
    />
  );
}

export function DependentFields() {
  return <FieldGuidanceTable fields={DEPENDENT_FIELDS} labelledBy="dependent-fields" />;
}
