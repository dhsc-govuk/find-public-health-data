import { InsetText, Tabs } from '@fphd/ui';
import { Link } from 'react-router';
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
}: Awaited<ReturnType<typeof loadIndicatorPage>>) {
  const primary = primaryIndicator(data.selected);
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
      <IndicatorSummary indicator={detail} observations={observations(primary)} />
      {data.areasLimited ? (
        <InsetText>
          Showing the first {MAX_SELECTED_AREAS + 1} selected areas. Select fewer areas to change
          which ones are shown.
        </InsetText>
      ) : null}
      <Tabs
        pageNavigation
        history="push"
        defaultParam={comparedDetail ? 'compare' : undefined}
        paramKey="tab-indicator"
        items={[
          {
            id: 'indicator-data',
            param: 'indicator',
            label: 'Indicator',
            content: (
              <IndicatorTab
                primary={primary}
                selectedAreas={data.selectedAreas}
                benchmarkGeography={data.benchmarkGeography}
                displayGroups={data.displayGroups}
                geographyOptions={data.geographyOptions}
                selection={data.selection}
              />
            ),
          },
          {
            id: 'indicator-compare-areas',
            param: 'areas',
            label: 'Compare areas',
            content: <CompareAreasTab primary={primary} {...comparison} />,
          },
          {
            id: 'indicator-compare-indicators',
            param: 'compare',
            label: 'Compare indicators',
            content: (
              <CompareIndicatorsTab
                {...comparison}
                primary={primary}
                compared={data.selected[1]}
                findResults={data.findResults}
                findSubject={data.findSubject}
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
                <BackgroundInformation indicator={detail} observations={observations(primary)} />
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
