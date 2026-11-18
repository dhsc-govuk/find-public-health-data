/** How often an indicator's data is updated, or that it no longer will be. */
export const UPDATE_FREQUENCIES = [
  'monthly',
  'quarterly',
  'annually',
  'every-n-years',
  'other',
  'no-fixed-frequency',
  'no-longer-updated',
] as const;

export type UpdateFrequency = (typeof UPDATE_FREQUENCIES)[number];

export const UPDATE_FREQUENCY_LABELS: Readonly<Record<UpdateFrequency, string>> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
  'every-n-years': 'Frequency of more than 1 year',
  other: 'Other',
  'no-fixed-frequency': 'No fixed frequency',
  'no-longer-updated': 'This indicator will no longer be updated',
};

/** The fewest years between updates that "Frequency of more than 1 year" takes. */
export const UPDATE_FREQUENCY_MIN_YEARS = 2;

/** The most years between updates the form takes, which keeps the number to two digits. */
export const UPDATE_FREQUENCY_MAX_YEARS = 99;

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

/** How the public metadata introduces the reason given for each answer that has one. */
const REASON_INTRODUCTIONS: Readonly<Record<UpdateFrequencyWithReason, string>> = {
  'no-fixed-frequency': 'No fixed frequency, for the following reason:',
  'no-longer-updated': 'This indicator will no longer be updated for the following reason:',
};

/** An answer to the update frequency question, with the details its answer asks for. */
export interface UpdateFrequencyAnswer {
  updateFrequency: UpdateFrequency;
  /** The number of years between updates, beside "Frequency of more than 1 year" only. */
  updateFrequencyYears: number | null;
  /** The publisher's own description, beside "Other" only. */
  updateFrequencyText: string | null;
  /** Why there is no fixed frequency, or why the indicator will no longer be updated. */
  updateFrequencyReason: string | null;
}

/** The update frequency as the public metadata words it, and the reason it shows below. */
export interface PublicUpdateFrequency {
  text: string;
  reason: string | null;
}

/**
 * The update frequency as the public metadata words it.
 *
 * - "Frequency of more than 1 year" reads "Every 3 years".
 * - "Other" reads as the publisher's own description.
 * - An answer with a reason reads as an introduction, with the reason shown below it.
 * - Any other answer reads as its label.
 *
 * An answer without the detail it asks for falls back to its label. Indicators imported from
 * Fingertips can have "No fixed frequency" or "This indicator will no longer be updated" without
 * a reason, for example.
 */
export function publicUpdateFrequency({
  updateFrequency,
  updateFrequencyYears,
  updateFrequencyText,
  updateFrequencyReason,
}: UpdateFrequencyAnswer): PublicUpdateFrequency {
  if (hasUpdateFrequencyReason(updateFrequency) && updateFrequencyReason) {
    return { text: REASON_INTRODUCTIONS[updateFrequency], reason: updateFrequencyReason };
  }
  if (updateFrequency === 'every-n-years' && updateFrequencyYears !== null) {
    return { text: `Every ${updateFrequencyYears} years`, reason: null };
  }
  if (updateFrequency === 'other' && updateFrequencyText) {
    return { text: updateFrequencyText, reason: null };
  }
  return { text: UPDATE_FREQUENCY_LABELS[updateFrequency], reason: null };
}
