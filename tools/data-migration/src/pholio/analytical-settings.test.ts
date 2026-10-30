import { expect, it } from 'vitest';
import { indicatorAnalyticalSettings, type SourceGroupingSetting } from './analytical-settings.ts';

const grouping = (changes: Partial<SourceGroupingSetting> = {}): SourceGroupingSetting => ({
  IndicatorID: 108,
  GroupID: 1,
  ProfileId: 10,
  PolarityID: 0,
  ComparatorMethodID: 1,
  ...changes,
});
it('uses the owner even when a different setting is more common elsewhere', () => {
  expect(
    indicatorAnalyticalSettings(108, 10, [
      grouping(),
      grouping({ GroupID: 2, ProfileId: 20, PolarityID: 1 }),
      grouping({ GroupID: 3, ProfileId: 20, PolarityID: 1 }),
    ]),
  ).toEqual({ polarityId: 0, comparatorMethodId: 1 });
});
it('rejects conflicting settings within the owner with source group diagnostics', () => {
  expect(() =>
    indicatorAnalyticalSettings(108, 10, [grouping(), grouping({ GroupID: 2, PolarityID: 99 })]),
  ).toThrow(/108: conflicting polarity 0, 99 in groups 1, 2/);
});
it('rejects conflicting analytical methods rather than voting', () => {
  expect(() =>
    indicatorAnalyticalSettings(108, 10, [
      grouping(),
      grouping({ GroupID: 2, ComparatorMethodID: 2 }),
    ]),
  ).toThrow('conflicting comparator method');
});
it('allows the agreed neutral and quintile variants', () => {
  expect(
    indicatorAnalyticalSettings(108, 10, [
      grouping({ PolarityID: -1, ComparatorMethodID: -1 }),
      grouping({ GroupID: 2, PolarityID: 99, ComparatorMethodID: 15 }),
    ]),
  ).toEqual({ polarityId: 99, comparatorMethodId: 15 });
});
it('does not discard an explicit unspecified method when directional settings disagree', () => {
  expect(() =>
    indicatorAnalyticalSettings(108, 10, [
      grouping(),
      grouping({ GroupID: 2, ComparatorMethodID: -1 }),
    ]),
  ).toThrow('conflicting comparator method -1, 1');
});
it('uses a unanimous setting when an owner has no groupings', () => {
  expect(
    indicatorAnalyticalSettings(108, null, [grouping(), grouping({ ProfileId: 20 })]).polarityId,
  ).toBe(0);
});
it('leaves absent settings unanswered', () => {
  expect(indicatorAnalyticalSettings(108, null, [])).toEqual({
    polarityId: null,
    comparatorMethodId: null,
  });
});
