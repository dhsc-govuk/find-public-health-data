import { ChartSection } from '@fphd/ui';
import { periodLabel } from '@fphd/utils/period-label';
import {
  benchmarkJudgement,
  type ConfidenceLevel,
  inequalityCategoryLabel,
  segmentLabel,
  segmentValuesKey,
} from '../data.ts';
import type { InequalityRow } from '../inequalities.ts';
import type { IndicatorAreaData, IndicatorPageDetail, SelectedIndicator } from '../loader.ts';
import { alignedSeries, areaQuintile, englandCode } from './chart-data.ts';
import { ChartSources, NoChartData } from './chart-elements.tsx';
import { ObservationBars } from './observation-bars.tsx';

export function InequalitiesChart({
  id,
  observations,
  indicator,
  confidence,
  benchmark,
  areaName,
}: {
  id: string;
  observations: InequalityRow[];
  indicator: IndicatorPageDetail;
  confidence: ConfidenceLevel;
  benchmark: number | null;
  areaName: string;
}) {
  const first = observations[0];
  const dimension = first?.dimensions.find(({ dimensionClass }) => dimensionClass === 'inequality');
  const title = `Inequalities: ${indicator.name}, ${areaName}${
    first && dimension
      ? `, ${inequalityCategoryLabel(dimension.type)}, ${periodLabel(first, indicator.yearType)}`
      : ''
  }`;
  return (
    <ChartSection id={id} title={title}>
      <h2 className="govuk-heading-s govuk-!-margin-bottom-2">
        Chart of inequalities: {indicator.name}, {areaName}
      </h2>
      <ObservationBars
        rows={observations.map((observation) => ({
          key: segmentLabel(observation),
          name:
            observation.dimensions.find(({ type }) => type === dimension?.type)?.value ??
            segmentLabel(observation),
          observation,
          comparison: observation.comparison,
        }))}
        confidence={confidence}
        indicator={indicator}
        title={title}
        group="Segment"
        {...(benchmark === null
          ? {}
          : { benchmark: { name: 'England average', value: benchmark } })}
      />
      {benchmark === null ? (
        <p className="govuk-body-s">No England benchmark is available for this selection.</p>
      ) : null}
      <ChartSources indicators={[indicator]} />
    </ChartSection>
  );
}

export function CompareAreasChart({
  areas,
  confidence,
  indicator,
  colourByQuintile,
  levelByCode,
  ranges,
}: {
  areas: IndicatorAreaData[];
  confidence: ConfidenceLevel;
  indicator: IndicatorPageDetail;
  colourByQuintile: boolean;
  levelByCode: Record<string, string>;
  ranges: NonNullable<SelectedIndicator['ranges']>;
}) {
  const series = alignedSeries(areas);
  const local = series.filter(({ code }) => code !== englandCode);
  const england = series.find(({ code }) => code === englandCode);
  const observations = local.flatMap(({ observations }) => [...observations]);
  const latest = observations
    .filter(([, point]) => point.value !== null)
    .sort(
      ([, a], [, b]) => a.toDate.localeCompare(b.toDate) || a.fromDate.localeCompare(b.fromDate),
    )
    .at(-1);
  if (!latest)
    return (
      <NoChartData>
        {local.length === 0 ? 'Select areas to compare their values.' : undefined}
      </NoChartData>
    );
  const [period, observation] = latest;
  const benchmarkValue = england?.observations.get(period)?.value ?? null;
  const segment = segmentValuesKey(observation);
  const rows = local
    .map(({ code, name, observations }) => {
      const point = observations.get(period);
      const level = levelByCode[code];
      const range =
        colourByQuintile && level
          ? ranges[level]?.find(
              (range) =>
                range.fromDate === observation.fromDate &&
                range.toDate === observation.toDate &&
                range.segment === segment,
            )
          : undefined;
      return {
        key: code,
        name,
        observation: point,
        comparison: benchmarkJudgement(point, benchmarkValue, indicator),
        quintile: areaQuintile(point?.value, range?.quintileCutoffs),
      };
    })
    .sort((a, b) => (b.observation?.value ?? -Infinity) - (a.observation?.value ?? -Infinity));
  const title = `Compare areas: ${indicator.name}, ${periodLabel(observation, indicator.yearType)}, ${segmentLabel(observation)}`;
  return (
    <ChartSection id={`area-comparison-${indicator.shortId}`} title={title}>
      <h3 className="govuk-heading-s">{periodLabel(observation, indicator.yearType)}</h3>
      {colourByQuintile ? (
        <p className="govuk-body-s">
          Quintiles rank values across all areas of the same geography level. At least five values
          are needed, and tied values stay in the same group.
        </p>
      ) : null}
      <ObservationBars
        rows={rows}
        confidence={confidence}
        indicator={indicator}
        title={title}
        group="Area"
        colourByQuintile={colourByQuintile}
        {...(benchmarkValue === null || colourByQuintile
          ? {}
          : { benchmark: { name: 'England', value: benchmarkValue } })}
      />
      <ChartSources indicators={[indicator]} />
    </ChartSection>
  );
}
