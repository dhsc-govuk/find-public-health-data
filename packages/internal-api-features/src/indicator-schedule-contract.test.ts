import { describe, expect, it } from 'vitest';
import { publishingDateSection } from './indicator-publishing-date-contract.ts';
import { FUTURE_PUBLISHING_DATE, scheduleSchemaFor } from './indicator-schedule-contract.ts';
import { toFieldErrors } from './indicator-section-contract.ts';

// 09:30 BST on 14 September 2027.
const NOW = new Date('2027-09-14T08:30:00.000Z');

function answers(day: string, month: string, year: string, hour = '09', minute = '30') {
  return {
    publishingDateDay: day,
    publishingDateMonth: month,
    publishingDateYear: year,
    publishingTimeHour: hour,
    publishingTimeMinute: minute,
  };
}

function fieldErrors(body: ReturnType<typeof answers>) {
  const parsed = scheduleSchemaFor(NOW).safeParse(body);
  return parsed.success ? undefined : toFieldErrors(parsed.error, publishingDateSection.fields);
}

const IN_THE_PAST = {
  publishingDateDay: FUTURE_PUBLISHING_DATE,
  publishingDateMonth: FUTURE_PUBLISHING_DATE,
  publishingDateYear: FUTURE_PUBLISHING_DATE,
};

describe('scheduleSchemaFor', () => {
  it('takes a date and time in the future as the instant they name in UK time', () => {
    expect(scheduleSchemaFor(NOW).parse(answers('4', '1', '2028', '15', '05'))).toEqual({
      scheduledPublishAt: new Date('2028-01-04T15:05:00.000Z'),
    });
  });

  it('takes a time later today, with no notice period', () => {
    expect(scheduleSchemaFor(NOW).parse(answers('14', '9', '2027', '09', '31'))).toEqual({
      scheduledPublishAt: new Date('2027-09-14T08:31:00.000Z'),
    });
  });

  it.each([
    ['now', answers('14', '9', '2027', '09', '30')],
    ['earlier today', answers('14', '9', '2027', '09', '00')],
    ['a past date', answers('13', '9', '2027', '23', '59')],
  ])('refuses %s on the date parts', (_, body) => {
    expect(fieldErrors(body)).toEqual(IN_THE_PAST);
  });

  it('refuses a time the spring clock change skips on the time parts', () => {
    expect(fieldErrors(answers('26', '3', '2028', '01', '30'))).toEqual({
      publishingTimeHour: 'Publishing time must be a real time',
      publishingTimeMinute: 'Publishing time must be a real time',
    });
  });

  it('takes a time the autumn clock change repeats as its second, GMT, occurrence', () => {
    // 01:30 BST on 31 October 2027, inside the hour the clocks then repeat.
    const inRepeatedHour = new Date('2027-10-31T00:30:00.000Z');

    expect(
      scheduleSchemaFor(inRepeatedHour).parse(answers('31', '10', '2027', '01', '15')),
    ).toEqual({ scheduledPublishAt: new Date('2027-10-31T01:15:00.000Z') });
  });

  it('gives the form rules first, such as a real date', () => {
    expect(fieldErrors(answers('31', '2', '2028'))).toEqual({
      publishingDateDay: 'Publishing date must be a real date',
    });
  });
});
