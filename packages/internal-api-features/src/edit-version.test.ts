import { describe, expect, it } from 'vitest';
import { editVersion } from './edit-version.ts';
import { editVersionSchema } from './edit-version-contract.ts';

describe('editVersion', () => {
  it('gives the same values the same version', () => {
    expect(editVersion({ definition: 'A', rationale: null })).toBe(
      editVersion({ definition: 'A', rationale: null }),
    );
  });

  it('gives changed values a different version', () => {
    expect(editVersion({ definition: 'A' })).not.toBe(editVersion({ definition: 'B' }));
  });

  it('gives a version the contract accepts', () => {
    expect(editVersionSchema.safeParse(editVersion({ name: 'An indicator' })).success).toBe(true);
  });
});
