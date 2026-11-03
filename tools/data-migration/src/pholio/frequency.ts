import type { UpdateFrequency } from '@fphd/utils/update-frequency';
import { translateFrequency } from '../fingertips-lookups.ts';
import { plainTextFromHtml } from '../plain-text.ts';

export function sourceUpdateFrequency(
  lookup: string | null,
  prose: string | null,
): UpdateFrequency | null {
  const structured = lookup === null ? null : translateFrequency(lookup);
  const text =
    prose === null ? '' : plainTextFromHtml(prose).trim().toLowerCase().replace(/[.]$/, '');
  if (!text) return structured;
  const description = text.replace(/^(?:(?:the )?data (?:will be|are) )?updated /, '');
  let described: UpdateFrequency | null = null;
  if (/^annual(?:ly)?$/.test(description)) described = 'annually';
  else if (description === 'monthly') described = 'monthly';
  else if (description === 'quarterly') described = 'quarterly';
  else if (/^every (2|two) years$/.test(text)) described = 'every-2-years';
  else if (text === 'no fixed frequency') described = 'no-fixed-frequency';
  else if (/^(this indicator will no longer be updated|no longer updated)$/.test(text))
    described = 'no-longer-updated';
  if (structured !== null && described !== null && structured !== described)
    throw new Error(`Conflicting source update frequencies: ${lookup}; ${prose}`);
  return described;
}
