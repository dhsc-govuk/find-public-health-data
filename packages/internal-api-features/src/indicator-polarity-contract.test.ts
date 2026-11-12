import { POLARITIES } from '@fphd/utils/polarity';
import { describe, expect, it } from 'vitest';

import { polaritySection as section } from './indicator-polarity-contract.ts';
import { sectionFieldErrors } from './testing.ts';

describe('polaritySection', () => {
  it.each(POLARITIES)('takes %s', (polarity) => {
    expect(section.schema.parse({ polarity })).toEqual({ polarity });
  });

  it.each([
    { polarity: '' },
    {},
    { polarity: 'sideways' },
    { polarity: 'RAG - High is good' },
    { polarity: 1 },
  ])('asks for a polarity given %o', (body) => {
    expect(sectionFieldErrors(section, body)).toEqual({
      polarity: 'Select the polarity of this indicator',
    });
  });
});
