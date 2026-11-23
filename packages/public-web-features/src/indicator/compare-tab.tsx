import {
  Button,
  CollapsibleFilterCard,
  FilterChip,
  FilterChips,
  GridColumn,
  GridRow,
  Radios,
} from '@fphd/ui';
import { Form, useLocation } from 'react-router';
import { neighbourAnchors } from './area-comparison.ts';
import { AreaControls } from './area-controls.tsx';
import { scatterPair } from './charts/chart-data.ts';
import { CompareIndicatorsChart } from './charts/scatter-chart.tsx';
import type { ScatterComparison } from './charts/scatter-loader.ts';
import type { compactIndicator } from './compact-data.ts';
import { useCompareAreaDetail } from './compare-area-detail.ts';
import { ComparePicker } from './compare-picker.tsx';
import type { IndicatorComparisonModel } from './comparison-model.ts';
import type {
  IndicatorPageDetail,
  IndicatorRangePeriod,
  IndicatorSummary,
  SelectedIndicator,
} from './loader.ts';
import { usePanelOptions } from './options.tsx';
import { IndicatorPairTable } from './tables/indicator-pair-table.tsx';
import { IndicatorViewDownload } from './view-download.tsx';

export interface ComparisonTabProps extends IndicatorComparisonModel {
  primary: Pick<SelectedIndicator, 'detail'>;
  areaChart: ReturnType<typeof compactIndicator>;
  compareAreaRanges: IndicatorRangePeriod[];
  scatter: ScatterComparison | undefined;
  /** Whether England is the only geography the indicator has data for. */
  englandOnly: boolean;
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
  englandOnly,
}: ComparisonTabProps & {
  compared:
    | Pick<IndicatorPageDetail, 'shortId' | 'name' | 'slug' | 'unit' | 'yearType' | 'dataSource'>
    | undefined;
  findResults: IndicatorSummary[] | Promise<IndicatorSummary[]>;
  findSubject: string;
}) {
  const { detail } = primary;
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const areaDetail = useCompareAreaDetail({
    shortId: detail.shortId,
    group: compareAreaGroup,
    areas: compareAreaOptions,
    params,
  });
  // This tab's area choices are the highlight ticks alone, so the neighbours filter, its label and
  // its checkboxes all start from them. Region ticks belong to the Compare areas tab.
  const anchors = neighbourAnchors(params.getAll('highlight'), areaDetail.areas).filter(
    ({ code }) => params.getAll('neighbours').includes(code),
  );
  const only = anchors.length
    ? new Set(anchors.flatMap(({ code, neighbours = [] }) => [code, ...neighbours]))
    : null;
  const groupLabel = only
    ? `${anchors.map(({ name }) => name).join(' and ')} and ${anchors.length > 1 ? 'their' : 'its'} statistical neighbours`
    : compareAreaGroup;
  const [options, applyOptions] = usePanelOptions('compare');
  const sexes = scatter?.variants?.map(({ sex }) => sex) ?? [];
  const selectedSex = sexes.includes(options.sex) ? options.sex : (sexes[0] ?? '');
  const highlighted = areaDetail.areas.filter(({ code }) =>
    params.getAll('highlight').includes(code),
  );
  const removeArea = (code: string) => {
    const next = new URLSearchParams(params);
    next.delete('highlight', code);
    next.delete('neighbours', code);
    return `${location.pathname}?${next}#indicator-compare-indicators`;
  };
  const selected = compared
    ? scatterPair([{ detail }, { detail: compared }], params).filter((entry) => entry !== undefined)
    : [];
  return (
    <>
      <h2 className="govuk-heading-l">Compare indicators</h2>
      <GridRow>
        {compared ? (
          <GridColumn width="one-quarter">
            {areaDetail.error ? (
              <p className="govuk-body-s" role="status">
                Statistical neighbours could not be loaded.{' '}
                <button type="button" className="fphd-link-button" onClick={areaDetail.retry}>
                  Try again
                </button>
              </p>
            ) : null}
            <AreaControls
              shortId={detail.shortId}
              group={compareAreaGroup}
              groups={comparisonDisplayGroups}
              areas={areaDetail.areas}
              displayOptions={false}
              englandOnly={englandOnly}
            />
            {sexes.length > 1 ? (
              <>
                <h2 className="govuk-heading-m">Table and chart options</h2>
                <CollapsibleFilterCard active headingLevel={3} title="Chart options">
                  <Form method="get" action={`${location.pathname}#indicator-compare-indicators`}>
                    {[...params]
                      .filter(([key]) => key !== 'sex-compare')
                      .map(([key, value], index) => (
                        <input key={`${key}-${index}`} name={key} value={value} type="hidden" />
                      ))}
                    <Radios
                      id="scatter-sex"
                      classModifiers="small"
                      name="sex-compare"
                      label="Sex"
                      options={sexes.map((value) => ({
                        label: value,
                        value,
                        checked: value === selectedSex,
                      }))}
                      onChange={(event) =>
                        applyOptions({ ...options, sex: event.currentTarget.value })
                      }
                    />
                    <noscript>
                      <Button type="submit">Apply options</Button>
                    </noscript>
                  </Form>
                </CollapsibleFilterCard>
              </>
            ) : null}
          </GridColumn>
        ) : null}
        <GridColumn width={compared ? 'three-quarters' : 'two-thirds'}>
          <div ref={areaDetail.ref}>
            <ComparePicker
              slug={detail.slug}
              key={compared?.slug ?? 'unselected'}
              name={detail.name}
              compared={compared}
              findSubject={findSubject}
              findResults={findResults}
            />
          </div>
          {compared && pair ? (
            <>
              <div className="fphd-indicator-showing">
                <p className="govuk-body-s govuk-!-margin-bottom-1">Showing:</p>
                <FilterChips>
                  {highlighted.length ? (
                    highlighted.map(({ code, name }) => (
                      <FilterChip
                        key={code}
                        value={code}
                        onRemove={removeArea(code)}
                        removeLabel={name}
                        replace
                      >
                        {name}
                      </FilterChip>
                    ))
                  ) : (
                    <FilterChip value="E92000001">England</FilterChip>
                  )}
                </FilterChips>
              </div>
              <IndicatorViewDownload slug={detail.slug} tab="compare" />
              <div className="fphd-indicator-chart fphd-indicator-chart--scatter">
                <CompareIndicatorsChart
                  key={selected.map(({ detail }) => detail.shortId).join('-')}
                  selected={selected}
                  scatter={scatter}
                  selectedAreaCodes={params.getAll('highlight')}
                  group={groupLabel}
                  only={only}
                  sex={selectedSex}
                  initialSwapped={params.has('scatter-x') || params.has('scatter-y')}
                />
              </div>
              {scatter?.points.length === 0 &&
              !scatter.variants?.some(({ points }) => points.length) ? (
                <IndicatorPairTable
                  indicators={[detail, compared]}
                  model={pair}
                  group={compareAreaGroup}
                  highlighted={params.getAll('highlight')}
                />
              ) : null}
            </>
          ) : null}
        </GridColumn>
      </GridRow>
    </>
  );
}
