import { FilterChip, FilterChips, GridColumn, GridRow } from '@fphd/ui';
import { useLocation } from 'react-router';
import { AreaControls } from './area-controls.tsx';
import { scatterPair } from './charts/chart-data.ts';
import { CompareIndicatorsChart } from './charts/scatter-chart.tsx';
import type { ScatterComparison } from './charts/scatter-loader.ts';
import type { compactIndicator } from './compact-data.ts';
import { ComparePicker } from './compare-picker.tsx';
import type { IndicatorComparisonModel } from './comparison-model.ts';
import type {
  IndicatorDetail,
  IndicatorRangePeriod,
  IndicatorSummary,
  SelectedIndicator,
} from './loader.ts';
import { IndicatorPairTable } from './tables/indicator-pair-table.tsx';
import { IndicatorViewDownload } from './view-download.tsx';

export interface ComparisonTabProps extends IndicatorComparisonModel {
  primary: Pick<SelectedIndicator, 'detail'>;
  areaChart: ReturnType<typeof compactIndicator>;
  compareAreaRanges: IndicatorRangePeriod[];
  scatter: ScatterComparison | undefined;
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
  scatter,
}: ComparisonTabProps & {
  compared:
    | Pick<IndicatorDetail, 'shortId' | 'name' | 'slug' | 'unit' | 'yearType' | 'dataSource'>
    | undefined;
  findResults: IndicatorSummary[] | Promise<IndicatorSummary[]>;
  findSubject: string;
}) {
  const { detail } = primary;
  const params = new URLSearchParams(useLocation().search);
  const selected = compared
    ? scatterPair([{ detail }, { detail: compared }], params).filter((entry) => entry !== undefined)
    : [];
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
            findResults={findResults}
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
                <CompareIndicatorsChart
                  key={selected.map(({ detail }) => detail.shortId).join('-')}
                  selected={selected}
                  scatter={scatter}
                  selectedAreaCodes={params.getAll('highlight')}
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
