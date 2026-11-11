import { InsetText, Tabs } from '@fphd/ui';
import { Link } from 'react-router';
import { CompletePageLink, DataSection, useDataReady } from '../data-section.tsx';
import { MAX_SELECTED_AREAS } from '../selection-limits.ts';
import { CompareAreasTab } from './areas-tab.tsx';
import { CompareIndicatorsTab } from './compare-tab.tsx';
import { IndicatorTab } from './indicator-tab.tsx';
import { InequalitiesTab } from './inequalities-tab.tsx';
import type { SelectedIndicator } from './loader.ts';
import { BackgroundInformation, IndicatorSummary } from './metadata.tsx';
import type { loadIndicatorPage } from './single-loader.ts';

function primaryIndicator(selected: SelectedIndicator[]) {
  const primary = selected[0];
  if (!primary) throw new Error('The indicator page needs one indicator');
  return primary;
}

function observations(primary: SelectedIndicator) {
  return (
    primary.areaData.find(({ areaCode }) => areaCode === 'E92000001')?.observations ??
    primary.areaData[0]?.observations ??
    []
  );
}

export function SingleIndicatorPage({
  detail,
  comparedDetail,
  data,
  comparison,
  complete,
}: Awaited<ReturnType<typeof loadIndicatorPage>>) {
  const contentReady = useDataReady([data, comparison]);
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
      <CompletePageLink complete={complete} />
      <DataSection label="indicator summary" resolve={data}>
        {({ selected, areasLimited }) => (
          <>
            <IndicatorSummary
              indicator={detail}
              observations={observations(primaryIndicator(selected))}
            />
            {areasLimited ? (
              <InsetText>
                Showing the first {MAX_SELECTED_AREAS + 1} selected areas. Select fewer areas to
                change which ones are shown.
              </InsetText>
            ) : null}
          </>
        )}
      </DataSection>
      <Tabs
        contentReady={contentReady}
        history="push"
        defaultParam={comparedDetail ? 'compare' : undefined}
        paramKey="tab-indicator"
        title={`${detail.name} contents`}
        items={[
          {
            id: 'indicator-data',
            param: 'indicator',
            label: 'Indicator',
            content: (
              <DataSection label="indicator data" resolve={data}>
                {(data) => (
                  <IndicatorTab
                    primary={primaryIndicator(data.selected)}
                    selectedAreas={data.selectedAreas}
                    benchmarkGeography={data.benchmarkGeography}
                    displayGroups={data.displayGroups}
                    geographyOptions={data.geographyOptions}
                    selection={data.selection}
                  />
                )}
              </DataSection>
            ),
          },
          {
            id: 'indicator-compare-areas',
            param: 'areas',
            label: 'Compare areas',
            content: (
              <DataSection label="area comparisons" resolve={comparison}>
                {(comparison) => (
                  <DataSection label="indicator data" resolve={data}>
                    {({ selected }) => (
                      <CompareAreasTab primary={primaryIndicator(selected)} {...comparison} />
                    )}
                  </DataSection>
                )}
              </DataSection>
            ),
          },
          {
            id: 'indicator-compare-indicators',
            param: 'compare',
            label: 'Compare indicators',
            content: (
              <DataSection label="indicator comparisons" resolve={comparison}>
                {(comparison) => (
                  <DataSection label="indicator data" resolve={data}>
                    {({ selected, findResults, findSubject }) => (
                      <CompareIndicatorsTab
                        {...comparison}
                        primary={primaryIndicator(selected)}
                        compared={selected[1]}
                        selected={selected}
                        findResults={findResults}
                        findSubject={findSubject}
                      />
                    )}
                  </DataSection>
                )}
              </DataSection>
            ),
          },
          {
            id: 'indicator-inequalities',
            param: 'inequalities',
            label: 'Inequalities',
            content: (
              <DataSection label="inequalities" resolve={data}>
                {({ selected }) => <InequalitiesTab primary={primaryIndicator(selected)} />}
              </DataSection>
            ),
          },
          {
            id: 'indicator-about',
            param: 'about',
            label: 'About this indicator',
            content: (
              <>
                <h2 className="govuk-heading-l">About this indicator</h2>
                <DataSection label="background information" resolve={data}>
                  {({ selected }) => (
                    <BackgroundInformation
                      indicator={detail}
                      observations={observations(primaryIndicator(selected))}
                    />
                  )}
                </DataSection>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
