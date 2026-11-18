import { publicUpdateFrequency } from '@fphd/utils/update-frequency';
import type { IndicatorPageDetail, IndicatorProviderSource } from './loader.ts';

export function providerSourceText(entries: IndicatorProviderSource[]): string {
  return entries
    .map(({ provider, source }) => (source ? `${provider}: ${source}` : provider))
    .join('; ');
}

export function updateFrequencyLine({
  updateFrequency,
  updateFrequencyReason,
  updateFrequencyText,
}: Pick<IndicatorPageDetail, 'updateFrequency' | 'updateFrequencyReason' | 'updateFrequencyText'>):
  | string
  | null {
  const fixed = updateFrequency && publicUpdateFrequency(updateFrequency, updateFrequencyReason);
  if (fixed?.reason) {
    return [updateFrequencyText, fixed.text, fixed.reason].filter(Boolean).join('\n');
  }
  return updateFrequencyText || fixed?.text || null;
}
