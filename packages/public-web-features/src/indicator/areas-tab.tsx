import { ChartSection, FilterChip, FilterChips, GridColumn, GridRow } from '@fphd/ui';
import { useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import { geographyGroupLabel } from '../geography/groups.ts';
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
import { quintileParam } from './charts/chart-data.ts';
import { expandIndicator } from './compact-data.ts';
import { useCompareAreaDetail } from './compare-area-detail.ts';
import type { ComparisonTabProps } from './compare-tab.tsx';
import {
  availableConfidenceLevels,
  availablePeriodTypes,
  dimensionValues,
  filterObservations,
} from './data.ts';
import { PanelOptionsPanel, usePanelOptions } from './options.tsx';
import { AreaComparisonTable } from './tables/area-comparison-table.tsx';
import { IndicatorViewDownload } from './view-download.tsx';

export function CompareAreasTab({
  primary,
  areas: comparison,
  compareAreaOptions,
  compareAreaGroup,
  comparisonDisplayGroups,
  areaChart,
  compareAreaRanges = [],
}: ComparisonTabProps) {
  const { detail } = primary;
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const {
    ref: detailRef,
    areas: areaOptions,
    error,
    retry,
  } = useCompareAreaDetail({
    slug: detail.slug,
    group: compareAreaGroup,
    areas: compareAreaOptions,
    params,
  });
  const [options, applyOptions] = usePanelOptions(detail.shortId);
  const compareAreasData = useMemo(() => expandIndicator(areaChart).areaData, [areaChart]);
  const observations = compareAreasData.flatMap(({ observations }) => observations);
  const confidenceLevels = availableConfidenceLevels(observations);
  const periodTypes = availablePeriodTypes(observations);
  const sexes = dimensionValues(observations, 'Sex');
  const confidence = confidenceLevels.includes(options.confidence as '95' | '99.8')
    ? options.confidence
    : 'none';
  const colourByQuintile = params.get(quintileParam(detail.shortId)) === 'yes';
  const chartAreas = compareAreasData.map((area) => ({
    ...area,
    observations: filterObservations(area.observations, {
      sex: sexes.includes(options.sex) ? options.sex : '',
      periodType: periodTypes.includes(options.periodType as '1-year' | '3-year')
        ? options.periodType
        : 'all',
    }),
  }));
  const shownAreas = highlightedAreas(params, areaOptions);
  const areasTabUrl = (next: URLSearchParams) =>
    `${location.pathname}?${next}#indicator-compare-areas`;
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
      <p className="govuk-body">
        {detail.name} for every {comparisonGeography} in England, most recent{' '}
        {comparison.multiYear ? 'multi-year' : 'single-year'} data
        {comparisonPeriod ? ` (${comparisonPeriod})` : ''}.
      </p>
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
              slug={detail.slug}
              group={compareAreaGroup}
              groups={comparisonDisplayGroups}
              areas={areaOptions}
            />
          </div>
        </GridColumn>
        <GridColumn width="three-quarters">
          <div className="fphd-indicator-showing">
            <p className="govuk-body-s govuk-!-margin-bottom-1">Showing:</p>
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
          </div>
          <IndicatorViewDownload slug={detail.slug} tab="areas" />
          <GridRow className="fphd-area-table-layout">
            <GridColumn width="one-half" className="fphd-area-table">
              <AreaSortControl areas={areaOptions} />
              <AreaComparisonTable
                indicator={primary}
                model={comparison}
                sort={params.get('areaSort') ?? 'descending'}
                highlighted={highlightedAreaCodes(params, areaOptions)}
                colour={areaColourMode(params.get('areaColour'))}
                only={statisticalNeighbourAreas(params, areaOptions)}
              />
            </GridColumn>
            <GridColumn width="one-half" className="fphd-map-space">
              <h3 className="govuk-heading-s govuk-!-margin-bottom-2">Map view</h3>
              <p className="govuk-body-s">
                Map of {detail.name} by {geographyGroupLabel(compareAreaGroup)} in England.
              </p>
              <div className="fphd-indicator-chart fphd-indicator-chart--map">
                <ChartSection
                  id="indicator-area-map"
                  title={`${detail.name} map`}
                  description="Map visualisation"
                />
              </div>
            </GridColumn>
          </GridRow>
          <h3 className="govuk-heading-s govuk-!-margin-bottom-2">Chart of area comparison</h3>
          <div className="fphd-indicator-chart fphd-indicator-chart--areas">
            <PanelOptionsPanel
              confidenceLevels={confidenceLevels}
              colourByQuintile={colourByQuintile}
              label="Area comparison options"
              onChange={applyOptions}
              options={options}
              panel="compare-areas"
              periodTypes={periodTypes}
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
