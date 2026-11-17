import type { IndicatorObservation } from '../loader.ts';
import { bounds } from './chart-data.ts';

export type BarColourMode = 'magnitude' | 'rag';
export type BarComparison = 'higher' | 'similar' | 'lower';

export const barPalettes = {
  magnitude: { higher: '#f46a25', similar: '#ffc000', lower: '#12436d' },
  rag: { higher: '#8ed973', similar: '#ffc000', lower: '#c00000' },
} as const;

export function barMean(values: (number | null | undefined)[]) {
  const numbers = values.filter((value): value is number => value != null);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

export function barComparison(
  observation: IndicatorObservation | undefined,
  average: number,
  confidence: '95' | '99.8' = '95',
): BarComparison | null {
  if (observation?.value == null) return null;
  const interval =
    bounds(observation, confidence) ?? bounds(observation, confidence === '95' ? '99.8' : '95');
  if (interval)
    return average < interval[0] ? 'higher' : average > interval[1] ? 'lower' : 'similar';
  const difference = observation.value - average;
  return Math.abs(difference) <= 0.5 ? 'similar' : difference > 0 ? 'higher' : 'lower';
}

export function barComparisonText(comparison: BarComparison | null, mode: BarColourMode) {
  if (!comparison) return 'No data';
  if (comparison === 'similar') return 'Similar to average';
  return `${mode === 'rag' ? (comparison === 'higher' ? 'Better' : 'Worse') : comparison === 'higher' ? 'Higher' : 'Lower'} than average`;
}
