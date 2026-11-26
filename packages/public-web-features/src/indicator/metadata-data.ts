import { publicUpdateFrequency } from '@fphd/utils/update-frequency';
import type { IndicatorPageDetail, IndicatorProviderSource } from './loader.ts';

export function providerSourceText(entries: IndicatorProviderSource[]): string {
  return entries
    .map(({ provider, source }) => (source ? `${provider}: ${source}` : provider))
    .join('; ');
}

/**
 * Where the indicator's data comes from, as a line under its inequalities: the numerator's
 * sources, or every data value's for an indicator with no numerator, or its data source.
 */
export function sourceLine(
  detail: Pick<IndicatorPageDetail, 'numeratorSources' | 'dataValues' | 'dataSource'>,
): string | null {
  if (detail.numeratorSources.length > 0) return providerSourceText(detail.numeratorSources);

  const dataValueSources = detail.dataValues.flatMap(({ sources }) => sources);
  const distinct = dataValueSources.filter(
    (entry, index) =>
      dataValueSources.findIndex(
        ({ provider, source }) => provider === entry.provider && source === entry.source,
      ) === index,
  );
  if (distinct.length > 0) return providerSourceText(distinct);

  return detail.dataSource?.name ?? null;
}

/** A data value's heading: numbered only beside others. */
export function dataValueTitle(index: number, count: number): string {
  return count > 1 ? `Data value ${index + 1}` : 'Data value';
}

export function updateFrequencyLine({
  updateFrequency,
  ...details
}: Pick<
  IndicatorPageDetail,
  'updateFrequency' | 'updateFrequencyYears' | 'updateFrequencyText' | 'updateFrequencyReason'
>): string | null {
  if (updateFrequency === null) return null;
  const { text, reason } = publicUpdateFrequency({ updateFrequency, ...details });
  return reason ? `${text}\n${reason}` : text;
}
