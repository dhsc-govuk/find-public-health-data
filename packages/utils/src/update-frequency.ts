/** How often an indicator's data is updated, or that it no longer will be. */
export const UPDATE_FREQUENCIES = [
  'monthly',
  'quarterly',
  'annually',
  'every-2-years',
  'no-fixed-frequency',
  'no-longer-updated',
] as const;

export type UpdateFrequency = (typeof UPDATE_FREQUENCIES)[number];

export const UPDATE_FREQUENCY_LABELS: Readonly<Record<UpdateFrequency, string>> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
  'every-2-years': 'Every 2 years',
  'no-fixed-frequency': 'No fixed frequency',
  'no-longer-updated': 'This indicator will no longer be updated',
};

/** The answers a publisher gives a reason for, which no other answer has. */
export const UPDATE_FREQUENCIES_WITH_REASON = [
  'no-fixed-frequency',
  'no-longer-updated',
] as const satisfies readonly UpdateFrequency[];

export type UpdateFrequencyWithReason = (typeof UPDATE_FREQUENCIES_WITH_REASON)[number];

/** Whether the answer is one a publisher gives a reason for. */
export function hasUpdateFrequencyReason(
  frequency: UpdateFrequency | null,
): frequency is UpdateFrequencyWithReason {
  return UPDATE_FREQUENCIES_WITH_REASON.some((withReason) => withReason === frequency);
}
