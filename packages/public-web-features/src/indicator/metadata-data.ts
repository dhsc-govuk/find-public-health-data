import { publicUpdateFrequency } from '@fphd/utils/update-frequency';
import type { IndicatorDetail, IndicatorProviderSource } from './loader.ts';

export function providerSourceText(entries: IndicatorProviderSource[]): string {
  return entries
    .map(({ provider, source }) => (source ? `${provider}: ${source}` : provider))
    .join('; ');
}

export function updateFrequencyLine({
  updateFrequency,
  updateFrequencyReason,
  updateFrequencyText,
}: Pick<IndicatorDetail, 'updateFrequency' | 'updateFrequencyReason' | 'updateFrequencyText'>):
  | string
  | null {
  if (updateFrequencyText) return updateFrequencyText;
  if (!updateFrequency) return null;
  const { text, reason } = publicUpdateFrequency(updateFrequency, updateFrequencyReason);
  return reason ? `${text}\n${reason}` : text;
}
