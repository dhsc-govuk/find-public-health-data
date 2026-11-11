import { describe, expect, it } from 'vitest';

import { changesBetween, listChanges, rowOf } from './audit-log.ts';
import { uploadBatch } from './schema/index.ts';

const createdAt = new Date('2026-10-01T09:00:00.000Z');

describe('changesBetween', () => {
  it('gives every field of a created row as after, with nothing before', () => {
    expect(changesBetween(null, { id: 'a', title: 'Alcohol', description: null })).toEqual({
      id: { before: null, after: 'a' },
      title: { before: null, after: 'Alcohol' },
    });
  });

  it('gives every field of a deleted row as before, with nothing after', () => {
    expect(changesBetween({ id: 'a', title: 'Alcohol' }, null)).toEqual({
      id: { before: 'a', after: null },
      title: { before: 'Alcohol', after: null },
    });
  });

  it('gives only the fields that changed', () => {
    expect(
      changesBetween(
        { id: 'a', title: 'Alcohol', slug: 'alcohol' },
        { id: 'a', title: 'Alcohol use', slug: 'alcohol' },
      ),
    ).toEqual({ title: { before: 'Alcohol', after: 'Alcohol use' } });
  });

  it('gives a Date as its ISO string, and an equal Date as no change', () => {
    const confirmedAt = new Date('2026-10-02T10:00:00.000Z');

    expect(changesBetween({ confirmedAt: null }, { confirmedAt })).toEqual({
      confirmedAt: { before: null, after: '2026-10-02T10:00:00.000Z' },
    });
    expect(
      changesBetween({ confirmedAt }, { confirmedAt: new Date(confirmedAt.getTime()) }),
    ).toEqual({});
  });

  it('compares structured values by content', () => {
    expect(changesBetween({ names: ['a', 'b'] }, { names: ['a', 'b'] })).toEqual({});
    expect(changesBetween({ names: ['a', 'b'] }, { names: ['b', 'a'] })).toEqual({
      names: { before: ['a', 'b'], after: ['b', 'a'] },
    });
  });

  it('leaves out who wrote the row and when, which the entry records', () => {
    expect(
      changesBetween(
        { title: 'A', createdAt, createdBy: 'x', updatedAt: createdAt, updatedBy: 'x' },
        { title: 'A', createdAt, createdBy: 'x', updatedAt: new Date(), updatedBy: 'y' },
      ),
    ).toEqual({});
  });

  it('gives nothing for two equal rows', () => {
    expect(changesBetween({ id: 'a', title: 'A' }, { id: 'a', title: 'A' })).toEqual({});
  });
});

describe('listChanges', () => {
  it('gives each list whose contents changed, whole', () => {
    expect(
      listChanges(
        { numeratorSources: [{ providerId: 'a', sourceId: null }] },
        { numeratorSources: [{ providerId: 'b', sourceId: null }] },
      ),
    ).toEqual({
      numeratorSources: {
        before: [{ providerId: 'a', sourceId: null }],
        after: [{ providerId: 'b', sourceId: null }],
      },
    });
  });

  it('counts a reordered list as changed', () => {
    expect(listChanges({ numeratorSources: ['a', 'b'] }, { numeratorSources: ['b', 'a'] })).toEqual(
      { numeratorSources: { before: ['a', 'b'], after: ['b', 'a'] } },
    );
  });

  it('counts only the members of an unordered list', () => {
    expect(listChanges({ topicIds: ['a', 'b'] }, { topicIds: ['b', 'a'] }, ['topicIds'])).toEqual(
      {},
    );
    expect(listChanges({ topicIds: ['a'] }, { topicIds: ['a', 'b'] }, ['topicIds'])).toEqual({
      topicIds: { before: ['a'], after: ['a', 'b'] },
    });
  });

  it('gives only the lists in after, an absent before being empty', () => {
    expect(listChanges({ numeratorSources: ['a'], topicIds: ['t'] }, { ageRanges: ['r'] })).toEqual(
      {
        ageRanges: { before: [], after: ['r'] },
      },
    );
  });
});

describe('rowOf', () => {
  it("keys a JSON row by the table's properties, leaving out what it does not hold", () => {
    expect(
      rowOf(uploadBatch, { id: 'a', indicator_version_id: 'v', row_count: null, not_a_column: 1 }),
    ).toEqual({ id: 'a', indicatorVersionId: 'v', rowCount: null });
  });

  it('reads a timestamp as a Date, recorded to the millisecond as Drizzle rows are', () => {
    const row = rowOf(uploadBatch, { uploaded_at: '2026-10-19T17:04:00.737729+00:00' });

    expect(row.uploadedAt).toEqual(new Date('2026-10-19T17:04:00.737Z'));
    expect(changesBetween(null, row)).toEqual({
      uploadedAt: { before: null, after: '2026-10-19T17:04:00.737Z' },
    });
  });
});
