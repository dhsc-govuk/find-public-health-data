import { InsetText, Tabs } from '@fphd/ui';
import { type ReactNode, useMemo } from 'react';
import { Link } from 'react-router';
import { CompletePageLink, DataSection, useDataReady } from '../data-section.tsx';
import { MAX_SELECTED_AREAS } from '../selection-limits.ts';
import { CompareAreasTab } from './areas-tab.tsx';
import { expandIndicator } from './compact-data.ts';
import { CompareIndicatorsTab } from './compare-tab.tsx';
import { IndicatorTab } from './indicator-tab.tsx';
import { InequalitiesTab } from './inequalities-tab.tsx';
import type { SelectedIndicator } from './loader.ts';
import { BackgroundInformation, IndicatorSummary } from './metadata.tsx';
import type { loadIndicatorPage } from './single-loader.ts';

type CompactData = Awaited<Awaited<ReturnType<typeof loadIndicatorPage>>['data']>;
type ExpandedData = Omit<CompactData, 'selected'> & { selected: SelectedIndicator[] };

function IndicatorDataSection({
  cache,
  children,
  ...props
}: {
  cache: WeakMap<CompactData, ExpandedData>;
  label: string;
  resolve: CompactData | Promise<CompactData>;
  children: (data: ExpandedData) => ReactNode;
}) {
  return (
    <DataSection {...props}>
      {(value) => {
        let data = cache.get(value);
        if (!data) {
          data = { ...value, selected: value.selected.map(expandIndicator) };
          cache.set(value, data);
        }
        return children(data);
      }}
    </DataSection>
  );
}

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
  // Resolve before expanding so Suspense retries reuse the loader promise during navigation.
  const cache = useMemo(() => new WeakMap<CompactData, ExpandedData>(), []);
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
      <IndicatorDataSection cache={cache} label="indicator summary" resolve={data}>
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
      </IndicatorDataSection>
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
              <IndicatorDataSection cache={cache} label="indicator data" resolve={data}>
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
              </IndicatorDataSection>
            ),
          },
          {
            id: 'indicator-compare-areas',
            param: 'areas',
            label: 'Compare areas',
            content: (
              <DataSection label="area comparisons" resolve={comparison}>
                {(comparison) => <CompareAreasTab primary={{ detail }} {...comparison} />}
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
                  <CompareIndicatorsTab
                    {...comparison}
                    primary={{ detail }}
                    compared={comparedDetail}
                  />
                )}
              </DataSection>
            ),
          },
          {
            id: 'indicator-inequalities',
            param: 'inequalities',
            label: 'Inequalities',
            content: (
              <IndicatorDataSection cache={cache} label="inequalities" resolve={data}>
                {({ selected }) => <InequalitiesTab primary={primaryIndicator(selected)} />}
              </IndicatorDataSection>
            ),
          },
          {
            id: 'indicator-about',
            param: 'about',
            label: 'About this indicator',
            content: (
              <>
                <h2 className="govuk-heading-l">About this indicator</h2>
                <IndicatorDataSection cache={cache} label="background information" resolve={data}>
                  {({ selected }) => (
                    <BackgroundInformation
                      indicator={detail}
                      observations={observations(primaryIndicator(selected))}
                    />
                  )}
                </IndicatorDataSection>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
