import { A, FilterChip, FilterChips, GridColumn, GridRow } from '@fphd/ui';
import { useLocation, useNavigation } from 'react-router';
import { DownloadShareData } from '../download-share.tsx';
import type { GeographyOptions } from '../geography/loader.ts';
import { englandCode } from './charts/chart-data.ts';
import { TrendChart } from './charts/trend-chart.tsx';
import {
  availableConfidenceLevels,
  availableMeasures,
  availablePeriodTypes,
  dimensionValues,
  filterObservations,
} from './data.ts';
import { IndicatorGeographies } from './geographies.tsx';
import type {
  BenchmarkGeography,
  IndicatorSelection,
  SelectedArea,
  SelectedIndicator,
} from './loader.ts';
import { PanelOptionsPanel, useOptionParamNavigation, usePanelOptions } from './options.tsx';
import { indicatorCsvPath, indicatorMetadataPath, indicatorSelectionUrl } from './paths.ts';
import { TrendTable } from './tables/trend-table.tsx';
import { selectedTrendColumns, trendColumnsParam } from './trend.ts';

export function IndicatorTab({
  primary,
  selectedAreas,
  benchmarkGeography,
  displayGroups,
  geographyOptions,
  selection,
}: {
  primary: SelectedIndicator;
  selectedAreas: SelectedArea[];
  benchmarkGeography: BenchmarkGeography;
  displayGroups: string[];
  geographyOptions?: GeographyOptions | undefined;
  selection: IndicatorSelection;
}) {
  const { detail, areaData, regionData = [], ranges = {} } = primary;
  const id = detail.shortId;
  const location = useLocation();
  const navigation = useNavigation();
  const params = new URLSearchParams(navigation.location?.search ?? location.search);
  const [options, applyOptions] = usePanelOptions(id);
  const applyOptionParams = useOptionParamNavigation();
  const allObservations =
    areaData.find(({ areaCode }) => areaCode === 'E92000001')?.observations ??
    areaData[0]?.observations ??
    [];
  const pickedAreaData = areaData.filter(({ areaCode }) => areaCode !== 'E92000001');
  const shownObservations = (pickedAreaData.length ? pickedAreaData : areaData).flatMap(
    ({ observations }) => observations,
  );
  const sexes = dimensionValues(allObservations, 'Sex');
  const periodTypes = availablePeriodTypes(shownObservations);
  const confidenceLevels = availableConfidenceLevels(shownObservations);
  const measures = availableMeasures(shownObservations);
  const columns = selectedTrendColumns(params, id, [...measures, ...confidenceLevels]);
  const confidence = confidenceLevels.includes(options.confidence as '95' | '99.8')
    ? options.confidence
    : 'none';
  const periodType = periodTypes.includes(options.periodType as '1-year' | '3-year')
    ? options.periodType
    : 'all';
  const narrow = (data: (typeof areaData)[number]) => ({
    ...data,
    observations: filterObservations(data.observations, {
      sex: sexes.includes(options.sex) ? options.sex : '',
      periodType,
    }),
  });
  const filtered = areaData.map(narrow);
  const filteredRegions = regionData.map(narrow);
  const hasPickedAreas = pickedAreaData.length > 0;
  const regionAvailable = pickedAreaData.some(
    ({ areaCode }) => benchmarkGeography.regionByCode[areaCode],
  );
  const trendAreas = hasPickedAreas
    ? [
        ...pickedAreaData.map(narrow),
        ...(options.benchmark === 'england'
          ? filtered.filter(({ areaCode }) => areaCode === englandCode)
          : []),
        ...(options.benchmark === 'region'
          ? filteredRegions.filter(
              ({ areaCode }) => !pickedAreaData.some((area) => area.areaCode === areaCode),
            )
          : []),
      ]
    : filtered;
  const geography = (
    <IndicatorGeographies
      displayGroups={displayGroups}
      geographyOptions={geographyOptions}
      slug={detail.slug}
      selection={selection}
    />
  );
  const downloadParams = (withOptions: boolean) => {
    const next = new URLSearchParams();
    for (const { areaCode } of pickedAreaData) next.append('as', areaCode);
    if (withOptions) {
      next.set('order', 'desc');
      next.set(`columns-${id}`, trendColumnsParam(columns));
      if (sexes.includes(options.sex) && options.sex) next.set(`sex-${id}`, options.sex);
      if (periodType !== 'all') next.set(`pt-${id}`, periodType);
      if (confidence !== 'none') next.set(`ci-${id}`, confidence);
      if (options.benchmark !== 'none') next.set(`cmp-${id}`, options.benchmark);
      if (options.range) next.set(`cr-${id}`, 'yes');
    }
    return [...next];
  };
  const selectionUrl = (areaCodes: string[], areaLevels: string[]) =>
    indicatorSelectionUrl(location, areaCodes, areaLevels);
  const showing = (
    <div className="fphd-indicator-showing">
      <p className="govuk-body-s govuk-!-margin-bottom-1">Showing:</p>
      <FilterChips>
        <FilterChip value="E92000001">England</FilterChip>
        {selection.areaLevels.map((level) => (
          <FilterChip
            key={level}
            value={level}
            removeLabel={level}
            onRemove={selectionUrl(
              selection.areaCodes,
              selection.areaLevels.filter((entry) => entry !== level),
            )}
          >
            {level}
          </FilterChip>
        ))}
        {selection.areaCodes.map((code) => {
          const name = selectedAreas.find((area) => area.code === code)?.name ?? code;
          return (
            <FilterChip
              key={code}
              value={code}
              removeLabel={name}
              onRemove={selectionUrl(
                selection.areaCodes.filter((entry) => entry !== code),
                selection.areaLevels,
              )}
            >
              {name}
            </FilterChip>
          );
        })}
      </FilterChips>
    </div>
  );
  const download = (
    <DownloadShareData
      inline
      href={`${indicatorCsvPath(detail.slug, 'table')}?${new URLSearchParams(downloadParams(true))}`}
      allDataHref={`${indicatorCsvPath(detail.slug, 'all-data')}?allAreas=yes`}
      metadataHref={indicatorMetadataPath(detail.slug)}
    />
  );

  return (
    <>
      <h2 className="govuk-heading-l">Indicator</h2>
      <a className="govuk-link govuk-visually-hidden-focusable" href="#indicator-table">
        Skip to indicator chart and table
      </a>
      <GridRow>
        <GridColumn width="one-quarter">
          {geography}
          <h2 className="govuk-heading-m">Display options</h2>
          <PanelOptionsPanel
            accordion
            columns={columns}
            onColumnsChange={(next) =>
              applyOptionParams([[`columns-${id}`, trendColumnsParam(next), 'default']])
            }
            benchmarks={hasPickedAreas ? { region: regionAvailable } : undefined}
            confidenceLevels={confidenceLevels}
            measures={measures}
            label="Table columns"
            onChange={applyOptions}
            options={options}
            periodTypes={periodTypes}
            scope={id}
            target={{
              tabParam: 'tab-indicator',
              tabValue: 'indicator',
              anchor: 'indicator-data',
            }}
            sexes={sexes}
            showConfidence
          />
        </GridColumn>
        <GridColumn width="three-quarters">
          {showing}
          {download}
          <div className="fphd-indicator-chart fphd-indicator-chart--trend">
            <h3 className="govuk-heading-s">Chart: {detail.name}</h3>
            {hasPickedAreas ||
            confidenceLevels.length > 0 ||
            sexes.length > 0 ||
            periodTypes.length > 1 ? (
              <PanelOptionsPanel
                benchmarks={hasPickedAreas ? { region: regionAvailable } : undefined}
                confidenceLevels={confidenceLevels}
                label="Chart options"
                onChange={applyOptions}
                options={options}
                panel="chart"
                periodTypes={periodTypes}
                scope={id}
                sexes={sexes}
                showConfidence
                target={{
                  tabParam: 'tab-indicator',
                  tabValue: 'indicator',
                  anchor: 'indicator-data',
                }}
              />
            ) : null}
            <TrendChart
              id="indicator-trend-chart"
              title={`${detail.name} trend chart`}
              areas={trendAreas}
              indicator={detail}
              confidence={confidence}
            />
          </div>
          <div id="indicator-table" className="govuk-!-margin-top-4">
            <TrendTable
              newestFirst
              columns={columns}
              visibleCaption
              indicator={detail}
              areaData={filtered}
              benchmark={hasPickedAreas ? options.benchmark : 'none'}
              confidence={confidence}
              geography={benchmarkGeography}
              ranges={ranges}
              regionData={filteredRegions}
              showRange={options.range}
            />
          </div>
          {detail.dataSource ? (
            <p className="govuk-body-s">
              Source:{' '}
              {detail.dataSource.url ? (
                <A href={detail.dataSource.url}>{detail.dataSource.name}</A>
              ) : (
                detail.dataSource.name
              )}
            </p>
          ) : null}
        </GridColumn>
      </GridRow>
    </>
  );
}
