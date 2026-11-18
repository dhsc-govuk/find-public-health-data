import { CardList, GridColumn, GridRow, InsetText, SearchField } from '@fphd/ui';

const findDataCards = [
  {
    description: 'Browse data grouped by public health topics',
    href: '/topics',
    title: 'Browse by topic',
  },
  {
    description: 'Browse and filter all data, including by geographic area',
    href: '/search',
    title: 'Browse all data',
  },
];

export function PublicHomePage() {
  return (
    <GridRow>
      <GridColumn width="two-thirds">
        <h1 className="govuk-heading-xl">Find public health data</h1>
        <p className="govuk-body-l">
          Search and browse public health data for England. Use it to understand health in your
          area, monitor trends, identify inequalities and inform decisions.
        </p>
        <InsetText>This service was previously known as Fingertips.</InsetText>

        <form action="/search" method="get">
          <SearchField
            hint="For example, diabetes or mental health"
            id="home-search"
            label="Search for data"
            name="q"
          />
        </form>

        <h2 className="govuk-visually-hidden">Ways to find data</h2>
        <CardList columns="two" items={findDataCards} />

        <h2 className="govuk-heading-l">Public health data</h2>
        <p className="govuk-body">Public health data:</p>
        <ul className="govuk-list govuk-list--bullet">
          <li>
            is used to protect and improve the health of local, regional and national communities
            and populations
          </li>
          <li>
            can show the effect of inequalities in health, for example how health outcomes differ by
            age, sex, ethnicity, deprivation and other characteristics
          </li>
          <li>covers both medical and non-medical factors that influence health</li>
        </ul>
        <p className="govuk-body">
          The data in this service does not include individual-level data.
        </p>

        <h2 className="govuk-heading-l govuk-!-margin-top-6">Using this service</h2>
        <p className="govuk-body">
          Anyone with an interest in public health data can use this service. You will find{' '}
          <strong>indicators</strong> and other supporting data. Indicators are measures of a
          particular aspect of health, such as life expectancy or hospital admission rates.
        </p>
        <p className="govuk-body">
          The data in this service covers England, and areas within England, only.
        </p>
      </GridColumn>
    </GridRow>
  );
}
