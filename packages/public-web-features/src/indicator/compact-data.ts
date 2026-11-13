import { dataDictionary, dictionaryEntry } from '../data-dictionary.ts';
import type { IndicatorObservation, SelectedIndicator } from './loader.ts';

type ObservationRow = [
  period: number,
  dimensions: number,
  notes: number,
  value: number | null,
  lowerCi95: number | null,
  upperCi95: number | null,
  lowerCi998: number | null,
  upperCi998: number | null,
  count: number | null,
  numerator: number | null,
  denominator: number | null,
];

// Display options reuse the full history without a loader request, including inequality
// breakdowns. Dictionaries retain that history without repeating its metadata per point.
export function compactIndicator(indicator: SelectedIndicator) {
  const periods = dataDictionary<[string, string]>();
  const dimensions = dataDictionary<IndicatorObservation['dimensions']>();
  const notes = dataDictionary<IndicatorObservation['notes']>();
  const compactArea = (area: SelectedIndicator['areaData'][number]) => ({
    ...area,
    // React Router otherwise allocates a reference for every numeric matrix cell.
    observations: JSON.stringify(
      area.observations.map(
        (point): ObservationRow => [
          periods.index([point.fromDate, point.toDate]),
          dimensions.index(point.dimensions),
          notes.index(point.notes),
          point.value,
          point.lowerCi95,
          point.upperCi95,
          point.lowerCi998,
          point.upperCi998,
          point.count,
          point.numerator,
          point.denominator,
        ],
      ),
    ),
  });
  return {
    ...indicator,
    areaData: indicator.areaData.map(compactArea),
    regionData: indicator.regionData?.map(compactArea),
    catalogue: { periods: periods.entries, dimensions: dimensions.entries, notes: notes.entries },
  };
}

export function expandIndicator({
  catalogue,
  ...indicator
}: ReturnType<typeof compactIndicator>): SelectedIndicator {
  const expandArea = (area: (typeof indicator.areaData)[number]) => {
    const rows: ObservationRow[] = JSON.parse(area.observations);
    return {
      ...area,
      observations: rows.map(
        ([
          periodId,
          dimensionId,
          noteId,
          value,
          lowerCi95,
          upperCi95,
          lowerCi998,
          upperCi998,
          count,
          numerator,
          denominator,
        ]): IndicatorObservation => {
          const period = dictionaryEntry(catalogue.periods, periodId);
          const dimensions = dictionaryEntry(catalogue.dimensions, dimensionId);
          const notes = dictionaryEntry(catalogue.notes, noteId);
          return {
            fromDate: period[0],
            toDate: period[1],
            dimensions,
            notes,
            value,
            lowerCi95,
            upperCi95,
            lowerCi998,
            upperCi998,
            count,
            numerator,
            denominator,
          };
        },
      ),
    };
  };
  const { regionData, ...rest } = indicator;
  return {
    ...rest,
    areaData: indicator.areaData.map(expandArea),
    ...(regionData ? { regionData: regionData.map(expandArea) } : {}),
  };
}
