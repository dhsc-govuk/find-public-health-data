import { WarningText } from '@fphd/ui';

/** Warns that the figures shown may be for only part of the indicator's population. */
export function AgeWarning({ age }: { age: string | undefined }) {
  return age ? (
    <WarningText>
      These figures are for the age group {age}. This indicator also has data for other ages, which
      may match its title better.
    </WarningText>
  ) : null;
}
