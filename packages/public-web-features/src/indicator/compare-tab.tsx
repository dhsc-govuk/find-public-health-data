import { Button, FilterChip, FilterChips, GridColumn, GridRow, Select } from '@fphd/ui';
import { Form, useLocation } from 'react-router';
import { AreaControls } from './area-controls.tsx';
import { scatterPair } from './charts/chart-data.ts';
import { CompareIndicatorsChart } from './charts/scatter-chart.tsx';
import type { ScatterComparison } from './charts/scatter-loader.ts';
import { ComparePicker } from './compare-picker.tsx';
import type {
  AreaSummary,
  IndicatorAreaData,
  IndicatorRangePeriod,
  IndicatorSummary,
  SelectedIndicator,
} from './loader.ts';
import { useOptionParamNavigation } from './options.tsx';
import { IndicatorPairTable } from './tables/indicator-pair-table.tsx';
import { IndicatorViewDownload } from './view-download.tsx';

export interface ComparisonTabProps {
  primary: SelectedIndicator;
  compareAreasData: IndicatorAreaData[];
  compareAreaGroup: string;
  compareAreaOptions: AreaSummary[];
  comparisonDisplayGroups: string[];
  compareAreaRanges?: IndicatorRangePeriod[];
}

export function CompareIndicatorsTab({
  primary,
  compared,
  compareAreasData,
  comparedAreasData,
  compareAreaOptions,
  compareAreaGroup,
  comparisonDisplayGroups,
  findResults,
  findSubject,
  selected,
  scatter,
}: ComparisonTabProps & {
  compared: SelectedIndicator | undefined;
  comparedAreasData: IndicatorAreaData[];
  findResults: IndicatorSummary[];
  findSubject: string;
  selected: SelectedIndicator[];
  scatter?: ScatterComparison | undefined;
}) {
  const { detail } = primary;
  const id = detail.shortId;
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const apply = useOptionParamNavigation();
  const chartSelected = selected.map((entry) => ({
    ...entry,
    areaData: [
      ...(entry.detail.shortId === id
        ? compareAreasData
        : entry.detail.shortId === compared?.detail.shortId
          ? comparedAreasData
          : entry.areaData.filter(({ areaCode }) => areaCode !== 'E92000001')),
      ...entry.areaData.filter(({ areaCode }) => areaCode === 'E92000001'),
    ],
  }));
  const [x, y] = scatterPair(chartSelected, params);
  const pairSelect = (
    name: string,
    axis: string,
    entry: SelectedIndicator,
    other: SelectedIndicator,
  ) => (
    <Select
      name={name}
      id={name}
      label={`Choose ${axis} indicator`}
      value={String(entry.detail.shortId)}
      onChange={(event) => apply([[name, event.currentTarget.value, '']])}
      options={chartSelected
        .filter((candidate) => candidate !== other)
        .map(({ detail }) => ({ label: detail.name, value: String(detail.shortId) }))}
    />
  );
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
            key={compared?.detail.slug ?? 'unselected'}
            name={detail.name}
            compared={compared?.detail}
            findSubject={findSubject}
            findResults={findResults.filter(({ shortId }) => shortId !== id)}
          />
          {compared ? (
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
                {x && y ? (
                  <>
                    {selected.length > 2 ? (
                      <Form
                        action={`${location.pathname}#indicator-compare-indicators`}
                        method="get"
                        replace
                        preventScrollReset
                      >
                        {[...params]
                          .filter(
                            ([name]) => !['tab-indicator', 'scatter-x', 'scatter-y'].includes(name),
                          )
                          .map(([name, value], index) => (
                            <input
                              key={`${name}-${index}`}
                              type="hidden"
                              name={name}
                              value={value}
                            />
                          ))}
                        <input type="hidden" name="tab-indicator" value="compare" />
                        {pairSelect('scatter-x', 'horizontal axis', x, y)}
                        {pairSelect('scatter-y', 'vertical axis', y, x)}
                        <noscript>
                          <Button type="submit">Apply indicators</Button>
                        </noscript>
                      </Form>
                    ) : null}
                    <CompareIndicatorsChart
                      key={`${x.detail.shortId}-${y.detail.shortId}`}
                      selected={[x, y]}
                      scatter={scatter}
                      selectedAreaCodes={params.getAll('highlight')}
                    />
                  </>
                ) : null}
              </div>
              <IndicatorPairTable
                selected={[
                  {
                    ...primary,
                    areaData: [
                      ...primary.areaData.filter(({ areaCode }) => areaCode === 'E92000001'),
                      ...compareAreasData,
                    ],
                  },
                  {
                    ...compared,
                    areaData: [
                      ...compared.areaData.filter(({ areaCode }) => areaCode === 'E92000001'),
                      ...comparedAreasData,
                    ],
                  },
                ]}
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
