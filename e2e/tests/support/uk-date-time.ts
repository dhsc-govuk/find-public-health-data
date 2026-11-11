/**
 * A date and time split into the day, month, year, hour and minute fields that both publication
 * date forms use: the publisher's Publishing date task and the admin's confirm publication date
 * page. Each part is held as the text typed into its field.
 */
export type DateTime = { day: string; month: string; year: string; hour: string; minute: string };

const UK_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Splits `instant` into the publication date form's fields, giving the date and time in UK time
 * (Europe/London), so the result allows for British Summer Time.
 */
export function ukDateTime(instant: Date): DateTime {
  const parts = Object.fromEntries(
    UK_PARTS.formatToParts(instant).map(({ type, value }) => [type, value]),
  );
  return {
    day: parts.day ?? '',
    month: parts.month ?? '',
    year: parts.year ?? '',
    hour: parts.hour ?? '',
    minute: parts.minute ?? '',
  };
}
