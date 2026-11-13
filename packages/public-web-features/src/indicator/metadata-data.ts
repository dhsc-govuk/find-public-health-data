import { publicUpdateFrequency } from '@fphd/utils/update-frequency';
import type { IndicatorDetail, IndicatorProviderSource } from './loader.ts';

export function providerSourceText(entries: IndicatorProviderSource[]): string {
  return entries
    .map(({ provider, source }) => (source ? `${provider}: ${source}` : provider))
    .join('; ');
}

/** The update frequency for the metadata download, with the reason on the line below it. */
export function updateFrequencyText({
  updateFrequency,
  updateFrequencyReason,
}: Pick<IndicatorDetail, 'updateFrequency' | 'updateFrequencyReason'>): string {
  const { text, reason } = publicUpdateFrequency(updateFrequency, updateFrequencyReason);
  return reason ? `${text}\n${reason}` : text;
}
