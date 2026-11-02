import type { PholioRow } from './source.ts';

export interface SourceGroupingSetting extends PholioRow {
  IndicatorID: number;
  GroupID: number;
  ProfileId: number | null;
  PolarityID: number | null;
  ComparatorMethodID: number | null;
}

export function indicatorAnalyticalSettings(
  indicatorId: number,
  ownerProfileId: number | null,
  groupings: readonly SourceGroupingSetting[],
): { polarityId: number; comparatorMethodId: number | null } {
  if (ownerProfileId === null)
    throw new Error(`Indicator ${indicatorId}: no owning profile; source decision required`);
  const selected = groupings.filter(
    (row) => row.IndicatorID === indicatorId && row.ProfileId === ownerProfileId,
  );
  if (!selected.length)
    throw new Error(
      `Indicator ${indicatorId}: no groupings for owning profile ${ownerProfileId}; source decision required`,
    );
  const resolve = (values: readonly (number | null)[], kind: string): number | null => {
    const ids = [...new Set(values.filter((id): id is number => id !== null))].sort(
      (a, b) => a - b,
    );
    if (ids.length > 1)
      throw new Error(
        `Indicator ${indicatorId}: conflicting ${kind} ${ids.join(', ')} in groups ${[...new Set(selected.map((row) => row.GroupID))].join(', ')}; source decision required`,
      );
    return ids[0] ?? null;
  };
  const polarities = selected.map((row) => row.PolarityID);
  const neutral = polarities.every((id) => id === null || id === -1 || id === 99);
  const polarityId = neutral
    ? polarities.includes(99)
      ? 99
      : polarities.includes(-1)
        ? -1
        : null
    : resolve(polarities, 'polarity');
  if (polarityId === null)
    throw new Error(
      `Indicator ${indicatorId}: missing polarity in owning profile ${ownerProfileId}; source decision required`,
    );
  const methods = selected.map((row) => row.ComparatorMethodID);
  const quintiles = neutral && methods.every((id) => id === null || id === -1 || id === 15);
  const comparatorMethodId = quintiles
    ? methods.includes(15)
      ? 15
      : null
    : resolve(methods, 'comparator method');
  return { polarityId, comparatorMethodId: comparatorMethodId === -1 ? null : comparatorMethodId };
}
