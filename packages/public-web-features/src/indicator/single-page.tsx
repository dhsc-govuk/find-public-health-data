import { InsetText, Tabs } from '@fphd/ui';
import { Link } from 'react-router';
import type { GeographyOptions } from '../geography/loader.ts';
import { MAX_SELECTED_AREAS } from '../selection-limits.ts';
import { AREA_COMPARISON_GROUPS } from './area-comparison.ts';
import { CompareAreasTab } from './areas-tab.tsx';
import { CompareIndicatorsTab } from './compare-tab.tsx';
import { IndicatorTab } from './indicator-tab.tsx';
import { InequalitiesTab } from './inequalities-tab.tsx';
import type {
  AreaSummary,
  BenchmarkGeography,
  IndicatorAreaData,
  IndicatorSelection,
  IndicatorSummary as IndicatorSummaryData,
  SelectedArea,
  SelectedIndicator,
} from './loader.ts';
import { BackgroundInformation, IndicatorSummary } from './metadata.tsx';

export function SingleIndicatorPage({
  selected,
  selectedAreas = [],
  compareAreasData = [],
  comparedAreasData = [],
  compareAreaOptions = [],
  compareAreaGroup = 'Local authorities',
  displayGroups = [],
  comparisonDisplayGroups = displayGroups.filter((group) => AREA_COMPARISON_GROUPS.has(group)),
  benchmarkGeography = { regionByCode: {}, levelByCode: {} },
  findResults = [],
  findSubject = '',
  geographyOptions,
  areasLimited = false,
  selection,
}: {
  selected: SelectedIndicator[];
  selectedAreas?: SelectedArea[];
  compareAreasData?: IndicatorAreaData[];
  comparedAreasData?: IndicatorAreaData[];
  compareAreaOptions?: AreaSummary[];
  compareAreaGroup?: string;
  displayGroups?: string[];
  comparisonDisplayGroups?: string[];
  benchmarkGeography?: BenchmarkGeography;
  findResults?: IndicatorSummaryData[];
  findSubject?: string;
  geographyOptions?: GeographyOptions | undefined;
  areasLimited?: boolean;
  selection: IndicatorSelection;
}) {
  const primary = selected[0];
  if (!primary) throw new Error('The indicator page needs one indicator');
  const compared = selected[1];
  const { detail, areaData } = primary;
  const allObservations =
    areaData.find(({ areaCode }) => areaCode === 'E92000001')?.observations ??
    areaData[0]?.observations ??
    [];
  const comparisonProps = {
    primary,
    compareAreasData,
    compareAreaOptions,
    compareAreaGroup,
    comparisonDisplayGroups,
  };
  return (
    <div className="fphd-wide-layout fphd-single-indicator-page">
      <nav aria-label="Breadcrumb" className="govuk-breadcrumbs">
        <ol className="govuk-breadcrumbs__list">
          <li className="govuk-breadcrumbs__list-item">
            <Link className="govuk-breadcrumbs__link" to="/">
              Home
            </Link>
          </li>
          <li className="govuk-breadcrumbs__list-item">
            <Link className="govuk-breadcrumbs__link" to="/topics">
              Topics
            </Link>
          </li>
          {detail.topics[0] ? (
            <li className="govuk-breadcrumbs__list-item">
              <Link className="govuk-breadcrumbs__link" to={`/topics/${detail.topics[0].slug}`}>
                {detail.topics[0].title}
              </Link>
            </li>
          ) : null}
        </ol>
      </nav>
      <h1 className="govuk-heading-l govuk-!-margin-bottom-3">{detail.name}</h1>
      <IndicatorSummary indicator={detail} observations={allObservations} />
      {areasLimited ? (
        <InsetText>
          Showing the first {MAX_SELECTED_AREAS + 1} selected areas. Select fewer areas to change
          which ones are shown.
        </InsetText>
      ) : null}
      <Tabs
        history="push"
        defaultParam={compared ? 'compare' : undefined}
        paramKey="tab-indicator"
        title={`${detail.name} contents`}
        items={[
          {
            id: 'indicator-data',
            param: 'indicator',
            label: 'Indicator',
            content: (
              <IndicatorTab
                primary={primary}
                selectedAreas={selectedAreas}
                benchmarkGeography={benchmarkGeography}
                displayGroups={displayGroups}
                geographyOptions={geographyOptions}
                selection={selection}
              />
            ),
          },
          {
            id: 'indicator-compare-areas',
            param: 'areas',
            label: 'Compare areas',
            content: <CompareAreasTab {...comparisonProps} />,
          },
          {
            id: 'indicator-compare-indicators',
            param: 'compare',
            label: 'Compare indicators',
            content: (
              <CompareIndicatorsTab
                {...comparisonProps}
                compared={compared}
                comparedAreasData={comparedAreasData}
                findResults={findResults}
                findSubject={findSubject}
              />
            ),
          },
          {
            id: 'indicator-inequalities',
            param: 'inequalities',
            label: 'Inequalities',
            content: <InequalitiesTab primary={primary} />,
          },
          {
            id: 'indicator-about',
            param: 'about',
            label: 'About this indicator',
            content: (
              <>
                <h2 className="govuk-heading-l">About this indicator</h2>
                <BackgroundInformation indicator={detail} observations={allObservations} />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
