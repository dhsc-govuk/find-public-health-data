import { A, FilterChip, FilterChips, GridColumn, GridRow } from '@fphd/ui';
import { isOneOf } from '@fphd/utils/is-one-of';
import { useLocation, useNavigation } from 'react-router';
import { DownloadShareData } from '../download-share.tsx';
import type { GeographyOptions } from '../geography/loader.ts';
import { benchmarkCheckboxOptions, isRangeBenchmark, setBenchmarkParams } from './benchmarks.ts';
import { TrendChart } from './charts/trend-chart.tsx';
import {
  availableConfidenceLevels,
  availableMeasures,
  availablePeriodTypes,
  dimensionValues,
  filterObservations,
} from './data.ts';
import { IndicatorGeographies } from './geographies.tsx';
import { useIndicatorLinks } from './links.ts';
import type {
  BenchmarkGeography,
  IndicatorSelection,
  SelectedArea,
  SelectedIndicator,
} from './loader.ts';
import { englandObservations, NO_ENGLAND_MESSAGE, sexObservations } from './no-england.ts';
import {
  BenchmarksPanel,
  PanelOptionsPanel,
  useOptionParamNavigation,
  usePanelOptions,
} from './options.tsx';
import { indicatorSelectionUrl } from './paths.ts';
import { TrendTable } from './tables/trend-table.tsx';
import {
  selectedTrendColumns,
  trendChartAreas,
  trendColumnsParam,
  trendTableModel,
} from './trend.ts';

export function IndicatorTab({
  primary,
  selectedAreas,
  benchmarkGeography,
  displayGroups,
  geographyOptions,
  selection,
  defaultAreaLevel,
}: {
  primary: SelectedIndicator;
  selectedAreas: SelectedArea[];
  benchmarkGeography: BenchmarkGeography;
  displayGroups: string[];
  geographyOptions?: GeographyOptions | undefined;
  selection: IndicatorSelection;
  /** The level shown when nothing is chosen and the indicator has no England value. */
  defaultAreaLevel?: string | undefined;
}) {
  const { detail, areaData, regionData = [], benchmarkData = [], ranges = {} } = primary;
  const id = detail.shortId;
  const location = useLocation();
  const links = useIndicatorLinks();
  const navigation = useNavigation();
  const params = new URLSearchParams(navigation.location?.search ?? location.search);
  const [options, applyOptions] = usePanelOptions(id);
  const applyOptionParams = useOptionParamNavigation();
  const england = englandObservations(areaData);
  const hasEngland = england.length > 0;
  const pickedAreaData = areaData.filter(({ areaCode }) => areaCode !== 'E92000001');
  const shownObservations = (pickedAreaData.length ? pickedAreaData : areaData).flatMap(
    ({ observations }) => observations,
  );
  const sexes = dimensionValues(sexObservations(areaData), 'Sex');
  const periodTypes = availablePeriodTypes(shownObservations);
  const confidenceLevels = availableConfidenceLevels(shownObservations);
  const measures = availableMeasures(shownObservations);
  const columns = selectedTrendColumns(params, id, [...measures, ...confidenceLevels]);
  const confidence = isOneOf(confidenceLevels, options.confidence) ? options.confidence : 'none';
  const periodType = isOneOf(periodTypes, options.periodType) ? options.periodType : 'all';
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
  const benchmarkOptions = benchmarkCheckboxOptions(regionAvailable, {
    areas: pickedAreaData,
    geography: benchmarkGeography,
    englandObservations: england,
    goal: detail.goal,
  });
  const benchmarks = options.benchmarks.filter((choice) =>
    hasPickedAreas
      ? benchmarkOptions.some(({ value }) => value === choice)
      : choice === 'goal' && detail.goal,
  );
  const policyGoal = benchmarks.includes('goal') ? detail.goal : null;
  const model = trendTableModel({
    areaData: filtered,
    benchmarks,
    confidence,
    geography: benchmarkGeography,
    ranges,
    regionData: filteredRegions,
    benchmarkData: benchmarkData.map(narrow),
    goal: detail.goal,
  });
  const trendAreas = trendChartAreas(model);
  const geography = (
    <IndicatorGeographies
      shortId={id}
      displayGroups={displayGroups}
      geographyOptions={geographyOptions}
      selection={selection}
      englandBenchmark={hasEngland}
    >
      {hasPickedAreas && benchmarkOptions.length > 0 ? (
        <BenchmarksPanel
          choices={options.benchmarks}
          onChange={(benchmarks) => applyOptions({ ...options, benchmarks })}
          region={regionAvailable}
          availableOptions={benchmarkOptions}
          scope={id}
          target={{ tabParam: 'tab-indicator', tabValue: 'indicator', anchor: 'indicator-data' }}
        />
      ) : null}
    </IndicatorGeographies>
  );
  const downloadParams = (withOptions: boolean) => {
    const next = new URLSearchParams();
    for (const { areaCode } of pickedAreaData) next.append('as', areaCode);
    for (const { areaCode } of pickedAreaData) {
      if (benchmarkGeography.tierByCode?.[areaCode] === 'lower')
        next.set(`tier-${areaCode}`, 'lower');
    }
    if (withOptions) {
      next.set('order', 'desc');
      next.set(`columns-${id}`, trendColumnsParam(columns));
      if (sexes.includes(options.sex) && options.sex) next.set(`sex-${id}`, options.sex);
      if (periodType !== 'all') next.set(`pt-${id}`, periodType);
      if (confidence !== 'none') next.set(`ci-${id}`, confidence);
      setBenchmarkParams(next, id, benchmarks);
    }
    return [...next];
  };
  const selectionUrl = (areaCodes: string[], areaLevels: string[]) =>
    indicatorSelectionUrl(location, areaCodes, areaLevels, id);
  const showing = (
    <div className="fphd-indicator-showing">
      <p className="govuk-body-s govuk-!-margin-bottom-1">Showing:</p>
      <FilterChips collapse>
        {!hasPickedAreas ? <FilterChip value="E92000001">England</FilterChip> : null}
        {defaultAreaLevel ? (
          <FilterChip value={defaultAreaLevel}>{defaultAreaLevel}</FilterChip>
        ) : null}
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
        {(hasPickedAreas ? benchmarkOptions : [{ value: 'goal' as const, label: 'Policy goal' }])
          .filter(({ value }) => benchmarks.includes(value))
          .map(({ value, label }) => {
            const next = new URLSearchParams(location.search);
            setBenchmarkParams(
              next,
              id,
              options.benchmarks.filter((choice) => choice !== value),
            );
            return (
              <FilterChip
                key={value}
                value={value}
                removeLabel={label}
                onRemove={`${location.pathname}?${next}`}
                replace
              >
                {label}
              </FilterChip>
            );
          })}
      </FilterChips>
    </div>
  );
  const nothingShown = !hasEngland && !hasPickedAreas;
  const download = (
    <DownloadShareData
      inline
      href={
        nothingShown
          ? undefined
          : `${links.csv(detail.slug, 'table')}?${new URLSearchParams(downloadParams(true))}`
      }
      allDataHref={`${links.csv(detail.slug, 'all-data')}?allAreas=yes`}
      metadataHref={links.metadata(detail.slug)}
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
            rangeBenchmarks={hasPickedAreas && benchmarks.some(isRangeBenchmark)}
            policyGoal={!!policyGoal}
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
          {nothingShown ? (
            <p id="indicator-table" className="govuk-body">
              {NO_ENGLAND_MESSAGE}
            </p>
          ) : (
            <>
              <div className="fphd-indicator-chart fphd-indicator-chart--trend">
                <h3 className="govuk-heading-s">Chart: {detail.name}</h3>
                {hasPickedAreas ||
                detail.goal ||
                confidenceLevels.length > 0 ||
                sexes.length > 0 ||
                periodTypes.length > 1 ? (
                  <PanelOptionsPanel
                    rangeBenchmarks={hasPickedAreas && benchmarks.some(isRangeBenchmark)}
                    goalRadios={!hasPickedAreas && !!detail.goal}
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
                  benchmarkCodes={model.benchmarkGroups.map(({ areaCode }) => areaCode)}
                  indicator={detail}
                  confidence={confidence}
                  goal={policyGoal}
                />
              </div>
              <div id="indicator-table" className="govuk-!-margin-top-4">
                <TrendTable
                  newestFirst
                  columns={columns}
                  visibleCaption
                  indicator={detail}
                  areaData={filtered}
                  benchmarks={benchmarks}
                  confidence={confidence}
                  geography={benchmarkGeography}
                  ranges={ranges}
                  regionData={filteredRegions}
                  benchmarkData={benchmarkData.map(narrow)}
                />
              </div>
            </>
          )}
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
