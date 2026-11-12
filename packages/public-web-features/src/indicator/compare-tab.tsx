import { ChartSection, FilterChip, FilterChips, GridColumn, GridRow } from '@fphd/ui';
import { useLocation } from 'react-router';
import { AreaControls } from './area-controls.tsx';
import { ComparePicker } from './compare-picker.tsx';
import type { IndicatorComparisonModel } from './comparison-model.ts';
import type { IndicatorDetail, IndicatorSummary, SelectedIndicator } from './loader.ts';
import { IndicatorPairTable } from './tables/indicator-pair-table.tsx';
import { IndicatorViewDownload } from './view-download.tsx';

export interface ComparisonTabProps extends IndicatorComparisonModel {
  primary: Pick<SelectedIndicator, 'detail'>;
}

export function CompareIndicatorsTab({
  primary,
  compared,
  pair,
  compareAreaOptions,
  compareAreaGroup,
  comparisonDisplayGroups,
  findResults,
  findSubject,
}: ComparisonTabProps & {
  compared: Pick<IndicatorDetail, 'name' | 'slug' | 'unit'> | undefined;
  findResults: IndicatorSummary[];
  findSubject: string;
}) {
  const { detail } = primary;
  const id = detail.shortId;
  const params = new URLSearchParams(useLocation().search);
  return (
    <>
      <h2 className="govuk-heading-l">Compare indicators</h2>
      <GridRow>
        {compared ? (
          <GridColumn width="one-quarter">
            <AreaControls
              slug={detail.slug}
              group={compareAreaGroup}
              groups={comparisonDisplayGroups}
              areas={compareAreaOptions}
              displayOptions={false}
            />
          </GridColumn>
        ) : null}
        <GridColumn width={compared ? 'three-quarters' : 'two-thirds'}>
          <ComparePicker
            slug={detail.slug}
            key={compared?.slug ?? 'unselected'}
            name={detail.name}
            compared={compared}
            findSubject={findSubject}
            findResults={findResults.filter(({ shortId }) => shortId !== id)}
          />
          {compared && pair ? (
            <>
              <div className="fphd-indicator-showing">
                <p className="govuk-body-s govuk-!-margin-bottom-1">Showing:</p>
                <FilterChips>
                  <FilterChip value="E92000001">England</FilterChip>
                  <FilterChip value={compareAreaGroup}>{compareAreaGroup}</FilterChip>
                </FilterChips>
              </div>
              <IndicatorViewDownload slug={detail.slug} tab="compare" />
              <div className="fphd-indicator-chart fphd-indicator-chart--scatter">
                <h3 className="govuk-heading-s">Chart of indicator comparison</h3>
                <ChartSection
                  id="indicator-comparison-chart"
                  title="Indicator comparison scatter chart"
                  description={`${detail.name} compared with ${compared.name} for the selected geographies.`}
                />
              </div>
              <IndicatorPairTable
                indicators={[primary.detail, compared]}
                model={pair}
                group={compareAreaGroup}
                highlighted={params.getAll('highlight')}
              />
            </>
          ) : null}
        </GridColumn>
      </GridRow>
    </>
  );
}
