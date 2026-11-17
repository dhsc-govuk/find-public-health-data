import { describe, expect, it } from 'vitest';

import { slugOfRename } from './publication-slug-repository.ts';

const version = { indicatorId: 'i', name: 'Named by the update', slug: 'named-before-the-update' };

describe('slugOfRename', () => {
  it('gives a renamed update the slug of its new name', () => {
    expect(slugOfRename(version, 'Named before the update')).toBe('named-by-the-update');
  });

  it('moves an update that keeps its name nowhere, even when its slug is not that of its name', () => {
    expect(slugOfRename(version, 'Named by the update')).toBeNull();
  });

  it('moves a new indicator’s first version nowhere', () => {
    expect(slugOfRename(version, null)).toBeNull();
  });

  it('moves a rename that keeps the slug it carries nowhere', () => {
    expect(
      slugOfRename({ ...version, name: 'Named before the update!' }, 'Named before the update'),
    ).toBeNull();
  });
});
