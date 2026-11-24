import { InsetText, Tabs } from '@fphd/ui';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { DataSection, useDataReady } from '../data-section.tsx';
import { MAX_SELECTED_AREAS } from '../selection-limits.ts';
import { CompareAreasTab } from './areas-tab.tsx';
import { expandIndicator, expandScatterComparison } from './compact-data.ts';
import { CompareIndicatorsTab } from './compare-tab.tsx';
import { seriesSegments } from './data.ts';
import { IndicatorTab } from './indicator-tab.tsx';
import { InequalitiesTab } from './inequalities-tab.tsx';
import type { IndicatorPageDetail, SelectedIndicator } from './loader.ts';
import { BackgroundInformation, IndicatorDefinition, IndicatorSummary } from './metadata.tsx';
import { summaryObservations } from './no-england.ts';
import type { loadIndicatorPage } from './single-loader.ts';

type IndicatorPageProps = Awaited<ReturnType<typeof loadIndicatorPage>>;
type LoadedPageProps = Extract<IndicatorPageProps, { dataPlaceholder: null }>;
type CompactData = Awaited<LoadedPageProps['data']>;
type ExpandedData = Omit<CompactData, 'selected'> & { selected: SelectedIndicator[] };

function expandComparison(comparison: Awaited<LoadedPageProps['comparison']>) {
  return {
    ...comparison,
    scatter: comparison.scatter ? expandScatterComparison(comparison.scatter) : undefined,
  };
}

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
  const [completed, setCompleted] = useState(props.resolve);
  useEffect(() => {
    if (!(props.resolve instanceof Promise)) {
      setCompleted(props.resolve);
      return;
    }
    let active = true;
    void props.resolve.then(
      (value) => {
        if (active) setCompleted(value);
      },
      () => {
        if (active) setCompleted(props.resolve);
      },
    );
    return () => {
      active = false;
    };
  }, [props.resolve]);
  const resolve = props.resolve instanceof Promise ? completed : props.resolve;
  return (
    <DataSection {...props} resolve={resolve}>
      {(value) => children(expandData(cache, value))}
    </DataSection>
  );
}

function expandData(cache: WeakMap<CompactData, ExpandedData>, value: CompactData) {
  let data = cache.get(value);
  if (!data) {
    data = { ...value, selected: value.selected.map(expandIndicator) };
    cache.set(value, data);
  }
  return data;
}

/**
 * Every series in the page's data, once it has loaded, for the Compare areas tab's age warning.
 * That tab has only each area's shown series, and loads without waiting for this data.
 */
function useSeriesSegments(
  cache: WeakMap<CompactData, ExpandedData>,
  data: CompactData | Promise<CompactData>,
) {
  const [loaded, setLoaded] = useState(data instanceof Promise ? undefined : data);
  useEffect(() => {
    if (!(data instanceof Promise)) {
      setLoaded(data);
      return;
    }
    let active = true;
    setLoaded(undefined);
    void data.then(
      (value) => {
        if (active) setLoaded(value);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [data]);
  return useMemo(
    () => (loaded ? seriesSegments(expandData(cache, loaded).selected[0]?.areaData ?? []) : []),
    [cache, loaded],
  );
}

function primaryIndicator(selected: SelectedIndicator[]) {
  const primary = selected[0];
  if (!primary) throw new Error('The indicator page needs one indicator');
  return primary;
}

/** Each tab's content. A page with no data tabs, as a metadata-only preview is, has About alone. */
type IndicatorTabContents =
  | {
      indicator: ReactNode;
      areas: ReactNode;
      compare: ReactNode;
      inequalities: ReactNode;
      about: ReactNode;
    }
  | { about: ReactNode };

function dataTabs(tabs: Extract<IndicatorTabContents, { indicator: ReactNode }>) {
  return [
    { id: 'indicator-data', param: 'indicator', label: 'Indicator', content: tabs.indicator },
    { id: 'indicator-compare-areas', param: 'areas', label: 'Compare areas', content: tabs.areas },
    {
      id: 'indicator-compare-indicators',
      param: 'compare',
      label: 'Compare indicators',
      content: tabs.compare,
    },
    {
      id: 'indicator-inequalities',
      param: 'inequalities',
      label: 'Inequalities',
      content: tabs.inequalities,
    },
  ];
}

/** The indicator page: its heading, summary and tabs, around whatever content each one has. */
function IndicatorPageLayout({
  detail,
  summary,
  tabs,
  contentReady,
  compareFirst,
}: {
  detail: IndicatorPageDetail;
  summary: ReactNode;
  tabs: IndicatorTabContents;
  contentReady: boolean;
  compareFirst: boolean;
}) {
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
      <h1 className="govuk-heading-l govuk-!-margin-bottom-5">{detail.name}</h1>
      <IndicatorDefinition text={detail.definition} />
      {summary}
      <Tabs
        contentReady={contentReady}
        history="push"
        defaultParam={compareFirst ? 'compare' : undefined}
        paramKey="tab-indicator"
        title={`${detail.name} contents`}
        items={[
          ...('indicator' in tabs ? dataTabs(tabs) : []),
          {
            id: 'indicator-about',
            param: 'about',
            label: 'About this indicator',
            content: (
              <>
                <h2 className="govuk-heading-l">About this indicator</h2>
                {tabs.about}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

/**
 * The page of a preview's draft that has no data to show: each data section reads `text`. A
 * metadata-only preview leaves the data tabs out.
 */
function IndicatorPlaceholderPage({ detail, text }: { detail: IndicatorPageDetail; text: string }) {
  const placeholder = <p className="govuk-body">{text}</p>;
  const about = <BackgroundInformation indicator={detail} />;
  return (
    <IndicatorPageLayout
      detail={detail}
      contentReady
      compareFirst={false}
      summary={<IndicatorSummary indicator={detail} observations={[]} />}
      tabs={
        detail.dataState === 'metadata-only'
          ? { about }
          : {
              indicator: placeholder,
              areas: placeholder,
              compare: placeholder,
              inequalities: placeholder,
              about,
            }
      }
    />
  );
}

export function SingleIndicatorPage(props: IndicatorPageProps) {
  // Only a placeholder the loader gave replaces the data, so the public page always shows it.
  return typeof props.dataPlaceholder === 'string' ? (
    <IndicatorPlaceholderPage detail={props.detail} text={props.dataPlaceholder} />
  ) : (
    <LoadedIndicatorPage {...props} />
  );
}

function LoadedIndicatorPage({
  detail,
  comparedDetail,
  data,
  comparison,
  findSubject,
  findResults,
}: LoadedPageProps) {
  // Resolve before expanding so Suspense retries reuse the loader promise during navigation.
  const cache = useMemo(() => new WeakMap<CompactData, ExpandedData>(), []);
  const contentReady = useDataReady([data, comparison, findResults]);
  const segments = useSeriesSegments(cache, data);
  return (
    <IndicatorPageLayout
      detail={detail}
      contentReady={contentReady}
      compareFirst={comparedDetail !== undefined}
      summary={
        <IndicatorDataSection
          key={detail.shortId}
          cache={cache}
          label="indicator summary"
          resolve={data}
        >
          {({ selected, areasLimited }) => {
            const { period, trend } = summaryObservations(primaryIndicator(selected).areaData);
            return (
              <>
                <IndicatorSummary
                  indicator={detail}
                  observations={period}
                  trendObservations={trend}
                />
                {areasLimited ? (
                  <InsetText>
                    Showing the first {MAX_SELECTED_AREAS + 1} selected areas. Select fewer areas to
                    change which ones are shown.
                  </InsetText>
                ) : null}
              </>
            );
          }}
        </IndicatorDataSection>
      }
      tabs={{
        indicator: (
          <IndicatorDataSection
            key={detail.shortId}
            cache={cache}
            label="indicator data"
            resolve={data}
          >
            {(data) => (
              <IndicatorTab
                primary={primaryIndicator(data.selected)}
                selectedAreas={data.selectedAreas}
                benchmarkGeography={data.benchmarkGeography}
                displayGroups={data.displayGroups}
                geographyOptions={data.geographyOptions}
                selection={data.selection}
                defaultAreaLevel={data.defaultAreaLevel}
                areaTypeNotice={data.areaTypeNotice}
              />
            )}
          </IndicatorDataSection>
        ),
        areas: (
          <DataSection label="area comparisons" resolve={comparison}>
            {(comparison) => (
              <CompareAreasTab
                primary={{ detail }}
                {...expandComparison(comparison)}
                segments={segments}
              />
            )}
          </DataSection>
        ),
        compare: (
          <DataSection label="indicator comparisons" resolve={comparison}>
            {(comparison) => (
              <CompareIndicatorsTab
                {...expandComparison(comparison)}
                primary={{ detail }}
                compared={comparedDetail}
                findSubject={findSubject}
                findResults={findResults}
              />
            )}
          </DataSection>
        ),
        inequalities: (
          <IndicatorDataSection
            key={detail.shortId}
            cache={cache}
            label="inequalities"
            resolve={data}
          >
            {({ selected }) => <InequalitiesTab primary={primaryIndicator(selected)} />}
          </IndicatorDataSection>
        ),
        about: (
          <IndicatorDataSection
            key={detail.shortId}
            cache={cache}
            label="background information"
            resolve={data}
          >
            {({ selected }) => (
              <BackgroundInformation
                indicator={detail}
                observations={summaryObservations(primaryIndicator(selected).areaData).period}
              />
            )}
          </IndicatorDataSection>
        ),
      }}
    />
  );
}
