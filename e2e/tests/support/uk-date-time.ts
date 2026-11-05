/** A date and time as the publication date form's fields hold them. */
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

/** An instant as the form's parts in UK time. */
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
