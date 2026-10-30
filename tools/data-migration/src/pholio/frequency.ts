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
  let described: UpdateFrequency | null = null;
  if (
    /^(annual(?:ly)?|(?:the )?data (?:will be|are) updated annually|updated annually)$/.test(text)
  )
    described = 'annually';
  else if (/^(monthly|updated monthly)$/.test(text)) described = 'monthly';
  else if (/^(quarterly|updated quarterly)$/.test(text)) described = 'quarterly';
  else if (/^every (2|two) years$/.test(text)) described = 'every-2-years';
  else if (text === 'no fixed frequency') described = 'no-fixed-frequency';
  else if (/^(this indicator will no longer be updated|no longer updated)$/.test(text))
    described = 'no-longer-updated';
  if (structured !== null && described !== null && structured !== described)
    throw new Error(`Conflicting source update frequencies: ${lookup}; ${prose}`);
  return described;
}
