import { publicUpdateFrequency } from '@fphd/utils/update-frequency';
import type { IndicatorPageDetail, IndicatorProviderSource } from './loader.ts';

export function providerSourceText(entries: IndicatorProviderSource[]): string {
  return entries
    .map(({ provider, source }) => (source ? `${provider}: ${source}` : provider))
    .join('; ');
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
