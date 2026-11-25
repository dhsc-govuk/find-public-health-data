import type { IndicatorPageDetail } from './loader.ts';

type CiDisplayIndicator = Pick<IndicatorPageDetail, 'valueType' | 'fingertipsFormatting'>;

function confidenceLimitFormat(indicator: CiDisplayIndicator) {
  // Fingertips gives fixed decimals precedence over the Proportion formatter.
  // NumericFormatterFactory.cs:56–60 in ukhsa-collaboration/fingertips-open.
  const { maximum, decimalPlaces } = indicator.fingertipsFormatting ?? {};
  if (decimalPlaces != null && decimalPlaces >= 0) return { decimalPlaces, ceiling: null };
  if (indicator.valueType !== 'Proportion') return null;
  // ProportionFormatter.cs:80–110 uses uncapped formatters for small source-wide maxima.
  if (maximum != null && maximum < 10) return { decimalPlaces: maximum < 1 ? 3 : 2, ceiling: null };
  return { decimalPlaces: 1, ceiling: 100 };
}

export function displayConfidenceLimit(value: number, indicator: CiDisplayIndicator): number;
export function displayConfidenceLimit(
  value: number | null,
  indicator: CiDisplayIndicator,
): number | null;
export function displayConfidenceLimit(
  value: number | null,
  indicator: CiDisplayIndicator,
): number | null {
  // Source values must survive for CSV downloads; only the display formatter caps limits.
  // https://github.com/ukhsa-collaboration/fingertips-open/blob/678089724a516138232d273c4c7f511ed3c5a338/PholioVisualisationWS/Formatting/ProportionFormatter.cs#L70-L77
  const ceiling = confidenceLimitFormat(indicator)?.ceiling;
  return ceiling != null && value !== null && value >= 99.95 ? ceiling : value;
}

export function formatConfidenceLimit(
  value: number,
  indicator: CiDisplayIndicator,
  fallback: (value: number) => string,
): string {
  const format = confidenceLimitFormat(indicator);
  if (!format) return fallback(value);
  const displayed = displayConfidenceLimit(value, indicator);
  if (format.ceiling !== null && displayed === format.ceiling) return String(format.ceiling);
  return new Intl.NumberFormat('en-GB', {
    useGrouping: false,
    minimumFractionDigits: format.decimalPlaces,
    maximumFractionDigits: format.decimalPlaces,
  }).format(displayed);
}
