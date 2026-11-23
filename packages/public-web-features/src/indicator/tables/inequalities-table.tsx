import { TableScrollRegion } from '@fphd/ui';
import { periodLabel } from '@fphd/utils/period-label';
import { benchmarkJudgementLabel } from '../area-comparison.ts';
import {
  availableMeasures,
  type BenchmarkJudgement,
  benchmarkJudgement,
  type ConfidenceLevel,
  confidenceInterval,
  formatCalculatedValue,
  formatValue,
  inequalityCategoryLabel,
  inequalityValueLabel,
  MEASURES,
  type Measure,
  segmentLabel,
  unitNote,
} from '../data.ts';
import type { IndicatorObservation, IndicatorPageDetail } from '../loader.ts';
import { NoteFootnotes, noteMarker } from './note-markers.tsx';

export function InequalitiesTable({
  confidence,
  indicator,
  observations,
  comparisons,
  benchmark,
  benchmarkMeasures = { count: null },
  areaName = 'England',
}: {
  confidence: ConfidenceLevel;
  indicator: IndicatorPageDetail;
  observations: IndicatorObservation[];
  comparisons?: BenchmarkJudgement[];
  benchmark?: number | null;
  benchmarkMeasures?: Record<Measure, number | null>;
  areaName?: string;
}) {
  const first = observations[0];
  const compare = benchmark !== undefined;
  if (!first) {
    return null;
  }
  const available = compare ? availableMeasures([...observations, benchmarkMeasures]) : [];
  const measures = MEASURES.filter(({ key }) => available.includes(key));
  const dimensionType =
    first.dimensions.find(({ dimensionClass }) => dimensionClass === 'inequality')?.type ?? '';
  const noteTexts = [
    ...new Set(observations.flatMap(({ notes }) => notes.map(({ text }) => text))),
  ];
  const judgements =
    comparisons ??
    observations.map((observation) =>
      benchmarkJudgement(
        observation,
        benchmark ?? null,
        indicator,
        confidence === '99.8' ? '99.8' : '95',
      ),
    );

  return (
    <>
      <TableScrollRegion label={`${indicator.name} inequalities data table`}>
        <table className="govuk-table fphd-inequalities-table">
          <caption className="govuk-table__caption govuk-table__caption--s">
            {compare ? (
              <>
                Table of inequalities: {indicator.name}
                <span className="govuk-visually-hidden">
                  , {inequalityCategoryLabel(dimensionType)}, {areaName},{' '}
                  {periodLabel(first, indicator.yearType)}
                </span>
              </>
            ) : (
              <>
                {inequalityCategoryLabel(dimensionType)}, {periodLabel(first, indicator.yearType)}
              </>
            )}
          </caption>
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th scope="col" className="govuk-table__header">
                {compare ? inequalityCategoryLabel(dimensionType, true) : 'Segment'}
              </th>
              {measures.map(({ key, label }) => (
                <th
                  key={key}
                  scope="col"
                  className="govuk-table__header govuk-table__header--numeric"
                >
                  {label}
                </th>
              ))}
              <th scope="col" className="govuk-table__header govuk-table__header--numeric">
                {compare ? indicator.name : 'Value'}
                {unitNote(indicator.unit)}
              </th>
              {compare ? (
                <th scope="col" className="govuk-table__header">
                  Compared with England
                </th>
              ) : confidence === 'none' ? null : (
                <th scope="col" className="govuk-table__header govuk-table__header--numeric">
                  {confidence}% confidence interval
                </th>
              )}
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {compare ? (
              <tr className="govuk-table__row">
                <th scope="row" className="govuk-table__header">
                  England
                </th>
                {measures.map(({ key }) => (
                  <td key={key} className="govuk-table__cell govuk-table__cell--numeric">
                    {benchmarkMeasures[key] == null ? '—' : formatValue(benchmarkMeasures[key])}
                  </td>
                ))}
                <td className="govuk-table__cell govuk-table__cell--numeric">
                  {formatCalculatedValue(benchmark ?? null)}
                  {benchmark != null && indicator.unit === '%' ? '%' : ''}
                </td>
                <td className="govuk-table__cell">Benchmark</td>
              </tr>
            ) : null}
            {observations.map((observation, index) => (
              <tr className="govuk-table__row" key={segmentLabel(observation)}>
                <th scope="row" className="govuk-table__header">
                  {/* The category value alone — baseline dimensions describe the whole table. */}
                  {inequalityValueLabel(observation)}
                </th>
                {measures.map(({ key }) => (
                  <td key={key} className="govuk-table__cell govuk-table__cell--numeric">
                    {observation[key] == null ? '—' : formatValue(observation[key])}
                  </td>
                ))}
                <td className="govuk-table__cell govuk-table__cell--numeric">
                  {formatCalculatedValue(observation.value)}
                  {compare && observation.value != null && indicator.unit === '%' ? '%' : ''}
                  {observation.notes.map(({ text }) => noteMarker(noteTexts, text)).join('')}
                </td>
                {compare ? (
                  <td className="govuk-table__cell">
                    {benchmarkJudgementLabel(judgements[index] ?? 'none')}
                  </td>
                ) : confidence === 'none' ? null : (
                  <td className="govuk-table__cell govuk-table__cell--numeric">
                    {confidenceInterval(observation, confidence)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScrollRegion>
      <NoteFootnotes noteTexts={noteTexts} />
    </>
  );
}
