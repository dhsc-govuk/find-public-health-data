import { ChartSection, FilterChip, FilterChips, GridColumn, GridRow } from '@fphd/ui';
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import { geographyGroupLabel } from '../geography/groups.ts';
import { AgeWarning } from './age-warning.tsx';
import {
  areaColourMode,
  highlightedAreaCodes,
  highlightedAreas,
  statisticalNeighbourAreas,
  withoutHighlightedArea,
  withoutHighlightedAreas,
} from './area-comparison.ts';
import { AreaControls, AreaSortControl } from './area-controls.tsx';
import { CompareAreasChart } from './charts/bar-chart.tsx';
import { quintileParam, seriesReferenceArea } from './charts/chart-data.ts';
import { expandIndicator } from './compact-data.ts';
import { useCompareAreaDetail } from './compare-area-detail.ts';
import type { ComparisonTabProps } from './compare-tab.tsx';
import {
  availableConfidenceLevels,
  availablePeriodTypes,
  dimensionValues,
  filterObservations,
  uncertainSeriesAge,
} from './data.ts';
import type { IndicatorObservation } from './loader.ts';
import { PanelOptionsPanel, usePanelOptions } from './options.tsx';
import { Showing, toShowing } from './showing.tsx';
import { AreaComparisonTable } from './tables/area-comparison-table.tsx';
import { IndicatorViewDownload } from './view-download.tsx';

/** The chips of the areas shown, which take focus when one is removed or all are cleared. */
const SHOWING_ID = 'indicator-compare-areas-showing';

export function CompareAreasTab({
  primary,
  areas: comparison,
  compareAreaOptions,
  compareAreaGroup,
  comparisonDisplayGroups,
  areaChart,
  compareAreaRanges = [],
  englandOnly,
  segments,
}: ComparisonTabProps & {
  /** Every series the indicator has in the page's areas, as `seriesSegments` lists them. */
  segments: Pick<IndicatorObservation, 'dimensions'>[];
}) {
  const { detail } = primary;
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const {
    ref: detailRef,
    areas: areaOptions,
    error,
    retry,
  } = useCompareAreaDetail({
    shortId: detail.shortId,
    group: compareAreaGroup,
    areas: compareAreaOptions,
    params,
  });
  const compareAreasData = useMemo(() => expandIndicator(areaChart).areaData, [areaChart]);
  const observations = compareAreasData.flatMap(({ observations }) => observations);
  const confidenceLevels = availableConfidenceLevels(observations);
  const periodTypes = availablePeriodTypes(observations);
  const [options, applyOptions] = usePanelOptions(detail.shortId, periodTypes);
  const sexes = dimensionValues(observations, 'Sex');
  const confidence = confidenceLevels.includes(options.confidence as '95' | '99.8')
    ? options.confidence
    : 'none';
  const colourByQuintile = params.get(quintileParam(detail.shortId)) === 'yes';
  const chartAreas = compareAreasData.map((area) => ({
    ...area,
    observations: filterObservations(area.observations, {
      sex: sexes.includes(options.sex) ? options.sex : '',
      periodType:
        options.periodType !== 'all' && periodTypes.includes(options.periodType)
          ? options.periodType
          : 'all',
    }),
  }));
  const uncertainAge = uncertainSeriesAge(
    seriesReferenceArea(chartAreas)?.observations ?? [],
    segments,
  );
  const shownAreas = highlightedAreas(params, areaOptions);
  // The tab is named in the query, as the fragment names the chips rather than the tab.
  const areasTabUrl = (next: URLSearchParams) => {
    const withTab = new URLSearchParams(next);
    withTab.set('tab-indicator', 'areas');
    return toShowing(`${location.pathname}?${withTab}`, SHOWING_ID);
  };
  const comparisonPeriod = comparison.period;
  const comparisonGeography =
    compareAreaGroup === 'Local authorities'
      ? 'county and unitary authority'
      : compareAreaGroup === 'Statistical regions'
        ? 'statistical region'
        : compareAreaGroup === 'NHS regions'
          ? 'NHS region'
          : compareAreaGroup === 'Integrated care boards'
            ? 'integrated care board'
            : geographyGroupLabel(compareAreaGroup);
  return (
    <>
      <h2 className="govuk-heading-l">Compare areas</h2>
      {englandOnly ? null : (
        <p className="govuk-body">
          {detail.name} for every {comparisonGeography} in England, most recent{' '}
          {comparison.multiYear ? 'multi-year' : 'single-year'} data
          {comparisonPeriod ? ` (${comparisonPeriod})` : ''}.
        </p>
      )}
      <GridRow>
        <GridColumn width="one-quarter">
          <div ref={detailRef}>
            {error ? (
              <p className="govuk-body-s" role="status">
                Regions or statistical neighbours could not be loaded.{' '}
                <button type="button" className="fphd-link-button" onClick={retry}>
                  Try again
                </button>
              </p>
            ) : null}
            <AreaControls
              shortId={detail.shortId}
              comparedWithEngland={comparison.comparedWithEngland}
              group={compareAreaGroup}
              groups={comparisonDisplayGroups}
              areas={areaOptions}
              englandOnly={englandOnly}
            />
          </div>
        </GridColumn>
        <GridColumn width="three-quarters">
          {englandOnly ? null : (
            <Showing id={SHOWING_ID}>
              <FilterChips collapse>
                <FilterChip value={compareAreaGroup}>{compareAreaGroup}</FilterChip>
                {shownAreas.map(({ code, name }) => (
                  <FilterChip
                    key={code}
                    value={code}
                    onRemove={areasTabUrl(withoutHighlightedArea(params, areaOptions, code))}
                    removeLabel={name}
                    replace
                  >
                    {name}
                  </FilterChip>
                ))}
              </FilterChips>
              {shownAreas.length ? (
                <Link
                  className="govuk-link govuk-body-s"
                  preventScrollReset
                  replace
                  to={areasTabUrl(withoutHighlightedAreas(params))}
                >
                  Clear all
                </Link>
              ) : null}
            </Showing>
          )}
          <IndicatorViewDownload slug={detail.slug} tab="areas" />
          <AgeWarning age={uncertainAge} />
          <GridRow className="fphd-area-table-layout">
            <GridColumn width="one-half" className="fphd-area-table">
              <AreaSortControl areas={areaOptions} />
              <AreaComparisonTable
                indicator={primary}
                model={comparison}
                sort={params.get('areaSort') ?? 'descending'}
                highlighted={highlightedAreaCodes(params, areaOptions)}
                colour={areaColourMode(params.get('areaColour'), comparison.comparedWithEngland)}
                only={statisticalNeighbourAreas(params, areaOptions)}
              />
            </GridColumn>
            <GridColumn width="one-half" className="fphd-map-space">
              <h2 className="govuk-heading-s govuk-!-margin-bottom-2">Map view</h2>
              {englandOnly ? null : (
                <p className="govuk-body-s">
                  Map of {detail.name} by {geographyGroupLabel(compareAreaGroup)} in England.
                </p>
              )}
              <div className="fphd-indicator-chart fphd-indicator-chart--map">
                <ChartSection
                  id="indicator-area-map"
                  title={`${detail.name} map`}
                  description="Map visualisation"
                />
              </div>
            </GridColumn>
          </GridRow>
          <h2 className="govuk-heading-s govuk-!-margin-bottom-2">Chart of area comparison</h2>
          <div className="fphd-indicator-chart fphd-indicator-chart--areas">
            <PanelOptionsPanel
              confidenceLevels={confidenceLevels}
              colourByQuintile={colourByQuintile}
              label="Area comparison options"
              onChange={applyOptions}
              options={options}
              panel="compare-areas"
              period={
                periodTypes.length > 1
                  ? { options: ['all', ...periodTypes], value: options.periodType }
                  : undefined
              }
              scope={detail.shortId}
              sexes={sexes}
              showConfidence
              target={{
                tabParam: 'tab-indicator',
                tabValue: 'areas',
                anchor: 'indicator-compare-areas',
              }}
            />
            <CompareAreasChart
              areas={chartAreas}
              confidence={confidence}
              indicator={detail}
              colourByQuintile={colourByQuintile}
              levelByCode={Object.fromEntries(
                compareAreaOptions.map(({ code }) => [code, compareAreaGroup]),
              )}
              ranges={{ [compareAreaGroup]: compareAreaRanges }}
            />
          </div>
        </GridColumn>
      </GridRow>
    </>
  );
}
