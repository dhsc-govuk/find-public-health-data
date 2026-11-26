import {
  Button,
  CollapsibleFilterCard,
  FilterChip,
  FilterChips,
  GridColumn,
  GridRow,
  Select,
} from '@fphd/ui';
import { Form, useLocation, useNavigation } from 'react-router';
import { InequalitiesChart } from './charts/bar-chart.tsx';
import { availablePeriodTypes } from './data.ts';
import { inequalityTableModel } from './inequalities.ts';
import type { SelectedIndicator } from './loader.ts';
import { sourceLine } from './metadata-data.ts';
import { NO_ENGLAND_MESSAGE } from './no-england.ts';
import { InequalityOptions, useOptionParamNavigation, usePanelOptions } from './options.tsx';
import { InequalitiesTable } from './tables/inequalities-table.tsx';
import { IndicatorViewDownload } from './view-download.tsx';

export function InequalitiesTab({ primary }: { primary: SelectedIndicator }) {
  const { detail } = primary;
  const id = detail.shortId;
  const location = useLocation();
  const navigation = useNavigation();
  const params = new URLSearchParams(navigation.location?.search ?? location.search);
  const [options, applyOptions] = usePanelOptions(
    id,
    availablePeriodTypes(primary.areaData.flatMap(({ observations }) => observations)),
  );
  const applyOptionParams = useOptionParamNavigation();
  const inequality = inequalityTableModel(primary, params);
  const {
    areas: inequalityAreas,
    area: inequalityArea,
    categories,
    category,
    periods,
    period,
    rows: inequalityRows,
    benchmark: inequalityBenchmarkObservation,
    comparisonConfidence: inequalityConfidence,
  } = inequality;
  const inequalityBenchmark = inequalityBenchmarkObservation?.value ?? null;
  return (
    <>
      <h2 className="govuk-heading-l">Inequalities</h2>
      <GridRow>
        <GridColumn width="one-quarter">
          {inequalityAreas.length > 0 ? (
            <>
              <h2 className="govuk-heading-m">Geographies</h2>
              <CollapsibleFilterCard active headingLevel={null} title="Geographies">
                <Form method="get" action={`${location.pathname}#indicator-inequalities`}>
                  {[...params]
                    .filter(([name]) => name !== `ig-${id}`)
                    .map(([name, value], index) => (
                      <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
                    ))}
                  <Select
                    id={`inequality-area-${id}`}
                    name={`ig-${id}`}
                    label="Geography"
                    value={inequalityArea?.areaCode ?? 'E92000001'}
                    options={inequalityAreas.map(({ areaCode, areaName }) => ({
                      value: areaCode,
                      label: areaName,
                    }))}
                    onChange={(event) =>
                      applyOptionParams([[`ig-${id}`, event.currentTarget.value, 'E92000001']])
                    }
                  />
                  <noscript>
                    <Button type="submit">Apply geography</Button>
                  </noscript>
                </Form>
              </CollapsibleFilterCard>
            </>
          ) : null}
          {categories.length > 0 ? (
            <>
              <h2 className="govuk-heading-m">Display options</h2>
              <InequalityOptions
                accordion
                categories={categories}
                category={category}
                confidence={inequality.confidence}
                confidenceLevels={inequality.confidenceLevels}
                onCategoryChange={(value) =>
                  applyOptionParams([
                    [`ic-${id}`, value, categories[0] ?? ''],
                    [`ip-${id}`, '', ''],
                  ])
                }
                onConfidenceChange={(confidence) => applyOptions({ ...options, confidence })}
                onPeriodChange={(value) =>
                  applyOptionParams([[`ip-${id}`, value, periods.at(-1)?.value ?? '']])
                }
                period={period}
                periods={periods}
                scope={id}
                target={{
                  tabParam: 'tab-indicator',
                  tabValue: 'inequalities',
                  anchor: 'indicator-inequalities',
                }}
              />
            </>
          ) : null}
        </GridColumn>
        <GridColumn width="three-quarters">
          <div className="fphd-indicator-showing">
            <p className="govuk-body-s govuk-!-margin-bottom-1">Showing:</p>
            <FilterChips>
              <FilterChip value={inequalityArea?.areaCode ?? 'E92000001'}>
                {inequalityArea?.areaName ?? 'England'}
              </FilterChip>
              {inequality.sex ? (
                <FilterChip value={inequality.sex}>{inequality.sex}</FilterChip>
              ) : null}
            </FilterChips>
          </div>
          {inequalityAreas.length === 0 ? (
            <p className="govuk-body">{NO_ENGLAND_MESSAGE}</p>
          ) : categories.length === 0 ? (
            <p className="govuk-body">
              This indicator has no inequality breakdowns for the selected areas
              {inequality.sex ? ' and sex' : ''}.
            </p>
          ) : (
            <>
              <IndicatorViewDownload slug={detail.slug} tab="inequalities" />
              <div className="fphd-indicator-chart fphd-indicator-chart--inequalities">
                <InequalitiesChart
                  id="indicator-inequalities-chart"
                  indicator={detail}
                  confidence={inequality.confidence}
                  benchmark={inequalityBenchmark}
                  observations={inequalityRows}
                  areaName={inequalityArea?.areaName ?? 'England'}
                  sex={inequality.sex}
                />
              </div>
              <InequalitiesTable
                benchmark={inequalityBenchmark}
                benchmarkMeasures={{ count: inequalityBenchmarkObservation?.count ?? null }}
                indicator={detail}
                confidence={inequalityConfidence}
                observations={inequalityRows}
                areaName={inequalityArea?.areaName ?? 'England'}
                sex={inequality.sex}
              />
              {sourceLine(detail) === null ? null : (
                <p className="govuk-body-s">Source: {sourceLine(detail)}</p>
              )}
            </>
          )}
        </GridColumn>
      </GridRow>
    </>
  );
}
