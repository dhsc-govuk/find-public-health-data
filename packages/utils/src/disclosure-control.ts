/**
 * Whether disclosure control was applied to a figure of the calculation, described in its
 * detail when it was.
 */
export const INDICATOR_DISCLOSURE_CONTROL = ['yes', 'not-applicable'] as const;

export type IndicatorDisclosureControl = (typeof INDICATOR_DISCLOSURE_CONTROL)[number];

export const INDICATOR_DISCLOSURE_CONTROL_LABELS: Readonly<
  Record<IndicatorDisclosureControl, string>
> = {
  yes: 'Yes',
  'not-applicable': 'Not applicable',
};
