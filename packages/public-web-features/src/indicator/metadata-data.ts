import { publicUpdateFrequency } from '@fphd/utils/update-frequency';
import type { IndicatorPageDetail, IndicatorProviderSource } from './loader.ts';

export function providerSourceText(entries: IndicatorProviderSource[]): string {
  return entries
    .map(({ provider, source }) => (source ? `${provider}: ${source}` : provider))
    .join('; ');
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
