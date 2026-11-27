import { standardCalculationMethodOf } from '@fphd/utils/standard-methods';
import { describe, expect, it } from 'vitest';

import { readSeedTable } from './seed-csv.testing.ts';

/**
 * The seed arrives by COPY, so its answer to whether the standard calculation method was used is
 * given by the Python export's `standard_method.py`. Checking the committed CSV against the rule
 * here is what stops the export and the service drifting apart.
 */
describe('the committed seed', () => {
  it('keeps each methodology under No, unless its value type has no standard method', () => {
    const versions = readSeedTable('indicator_version');

    expect(versions.length).toBeGreaterThan(0);
    for (const row of versions) {
      const asked =
        (row.methodology ?? '') !== '' &&
        standardCalculationMethodOf(row.value_type_id ?? '') !== null;

      expect({ id: row.id, answer: row.standard_method_used }).toEqual({
        id: row.id,
        answer: asked ? 'f' : '',
      });
    }
  });
});
