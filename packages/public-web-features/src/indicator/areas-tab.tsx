import { ChartSection, FilterChip, FilterChips, GridColumn, GridRow } from '@fphd/ui';
import { useLocation } from 'react-router';
import { geographyGroupLabel } from '../geography/groups.ts';
import { AreaControls } from './area-controls.tsx';
import type { ComparisonTabProps } from './compare-tab.tsx';
import { AreaComparisonTable } from './tables/area-comparison-table.tsx';
import { IndicatorViewDownload } from './view-download.tsx';

export function CompareAreasTab({
  primary,
  areas: comparison,
  compareAreaOptions,
  compareAreaGroup,
  comparisonDisplayGroups,
}: ComparisonTabProps) {
  const { detail } = primary;
  const params = new URLSearchParams(useLocation().search);
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
          <AreaControls
            slug={detail.slug}
            group={compareAreaGroup}
            groups={comparisonDisplayGroups}
            areas={compareAreaOptions}
          />
        </GridColumn>
        <GridColumn width="three-quarters">
          <div className="fphd-indicator-showing">
            <p className="govuk-body-s govuk-!-margin-bottom-1">Showing:</p>
            <FilterChips>
              <FilterChip value={compareAreaGroup}>{compareAreaGroup}</FilterChip>
            </FilterChips>
          </div>
          <IndicatorViewDownload slug={detail.slug} tab="areas" />
          <GridRow className="fphd-area-table-layout">
            <GridColumn width="one-half" className="fphd-area-table">
              <AreaComparisonTable
                indicator={primary}
                model={comparison}
                sort={params.get('areaSort') ?? 'descending'}
                highlighted={params.getAll('highlight')}
                colour={params.get('areaColour') ?? 'england'}
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
        </GridColumn>
      </GridRow>
    </>
  );
}
