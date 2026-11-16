import { publicUpdateFrequency } from '@fphd/utils/update-frequency';
import type { IndicatorDetail, IndicatorProviderSource } from './loader.ts';

/**
 * The terms on which anyone may use an indicator's data. They are the same for every indicator,
 * so the About tab and the metadata download show them without the publisher answering anything.
 */
export const DATA_USE = [
  { name: 'Copyright', text: '© Crown Copyright' },
  {
    name: 'Data re-use',
    text: 'The data may be used referencing Office for Health Improvement and Disparities',
  },
] as const;

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
