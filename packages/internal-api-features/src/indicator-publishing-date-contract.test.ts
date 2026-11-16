import { describe, expect, it } from 'vitest';

import {
  publishingDateTimeSchema,
  publishingDateSection as section,
} from './indicator-publishing-date-contract.ts';
import { sectionFieldErrors } from './testing.ts';

const answers = {
  publishingDateDay: '14',
  publishingDateMonth: '9',
  publishingDateYear: '2027',
  fastTracked: '',
  fastTrackReason: '',
  publishingTimeHour: '09',
  publishingTimeMinute: '30',
};

const fastTracked = (reason: string) => ({
  ...answers,
  fastTracked: 'yes',
  fastTrackReason: reason,
});

const ENTER_REASON = 'Enter the reason for fast-tracking';

const date = (day: string, month: string, year: string) => ({
  ...answers,
  publishingDateDay: day,
  publishingDateMonth: month,
  publishingDateYear: year,
});

const time = (hour: string, minute: string) => ({
  ...answers,
  publishingTimeHour: hour,
  publishingTimeMinute: minute,
});

const REAL_DATE = 'Publishing date must be a real date';
const REAL_TIME = 'Publishing time must be a real time';

describe('publishingDateSection', () => {
  it('takes a real date and time, trimmed', () => {
    expect(section.schema.parse({ ...answers, publishingDateDay: ' 14 ' })).toEqual(answers);
  });

  it.each([
    ['the first moment of a day', time('0', '0')],
    ['the last minute of a day', time('23', '59')],
    ['single digits', { ...date('1', '1', '2028'), ...time('9', '5') }],
    ['a leap day', date('29', '2', '2028')],
  ])('takes %s', (_, body) => {
    expect(sectionFieldErrors(section, body)).toBeUndefined();
  });

  it('asks for the date on each of its parts when none is given', () => {
    expect(sectionFieldErrors(section, date('', '', ''))).toEqual({
      publishingDateDay: 'Enter the publishing date',
      publishingDateMonth: 'Enter the publishing date',
      publishingDateYear: 'Enter the publishing date',
    });
  });

  it.each([
    [date('', '9', '2027'), { publishingDateDay: 'Publishing date must include a day' }],
    [date('14', '', '2027'), { publishingDateMonth: 'Publishing date must include a month' }],
    [date('14', '9', ' '), { publishingDateYear: 'Publishing date must include a year' }],
    [
      date('', '', '2027'),
      {
        publishingDateDay: 'Publishing date must include a day and month',
        publishingDateMonth: 'Publishing date must include a day and month',
      },
    ],
  ])('names the parts missing from a partial date, on those parts: %o', (body, errors) => {
    expect(sectionFieldErrors(section, body)).toEqual(errors);
  });

  it.each([
    ['day 31 of February', date('31', '2', '2027'), { publishingDateDay: REAL_DATE }],
    [
      'day 29 of February outside a leap year',
      date('29', '2', '2027'),
      { publishingDateDay: REAL_DATE },
    ],
    ['day 0', date('0', '9', '2027'), { publishingDateDay: REAL_DATE }],
    ['month 13', date('14', '13', '2027'), { publishingDateMonth: REAL_DATE }],
    ['a day in words', date('first', '9', '2027'), { publishingDateDay: REAL_DATE }],
    ['a fractional day', date('1.5', '9', '2027'), { publishingDateDay: REAL_DATE }],
    [
      'a day and month both wrong',
      date('32', '0', '2027'),
      { publishingDateDay: REAL_DATE, publishingDateMonth: REAL_DATE },
    ],
    [
      'a two-digit year',
      date('14', '9', '27'),
      { publishingDateYear: 'Year must include 4 numbers' },
    ],
    ['year 0', date('14', '9', '0000'), { publishingDateYear: REAL_DATE }],
    ['a year below 1000', date('14', '9', '0999'), { publishingDateYear: REAL_DATE }],
  ])('refuses %s, on the part to correct', (_, body, errors) => {
    expect(sectionFieldErrors(section, body)).toEqual(errors);
  });

  it('asks for the time on each of its parts when none is given', () => {
    expect(sectionFieldErrors(section, time('', ''))).toEqual({
      publishingTimeHour: 'Enter the publishing time',
      publishingTimeMinute: 'Enter the publishing time',
    });
  });

  it.each([
    [time('', '30'), { publishingTimeHour: 'Publishing time must include an hour' }],
    [time('09', ''), { publishingTimeMinute: 'Publishing time must include a minute' }],
  ])('names the part missing from a partial time: %o', (body, errors) => {
    expect(sectionFieldErrors(section, body)).toEqual(errors);
  });

  it.each([
    ['hour 24', time('24', '00'), { publishingTimeHour: REAL_TIME }],
    ['minute 60', time('09', '60'), { publishingTimeMinute: REAL_TIME }],
    ['a 12-hour time', time('9am', '30'), { publishingTimeHour: REAL_TIME }],
    ['a negative minute', time('09', '-1'), { publishingTimeMinute: REAL_TIME }],
    [
      'both parts wrong',
      time('25', '61'),
      { publishingTimeHour: REAL_TIME, publishingTimeMinute: REAL_TIME },
    ],
  ])('refuses %s, on the part to correct', (_, body, errors) => {
    expect(sectionFieldErrors(section, body)).toEqual(errors);
  });

  it('judges the date and the time apart', () => {
    expect(
      sectionFieldErrors(section, {
        ...date('31', '2', '2027'),
        publishingTimeHour: '',
        publishingTimeMinute: '',
      }),
    ).toEqual({
      publishingDateDay: REAL_DATE,
      publishingTimeHour: 'Enter the publishing time',
      publishingTimeMinute: 'Enter the publishing time',
    });
  });

  it('takes a fast-tracked date with a reason, trimmed', () => {
    expect(section.schema.parse(fastTracked('  For a ministerial briefing. '))).toEqual(
      fastTracked('For a ministerial briefing.'),
    );
  });

  it.each([
    ['none', ''],
    ['only spaces', '   '],
  ])('asks for the reason a fast-tracked indicator gives %s', (_, reason) => {
    expect(sectionFieldErrors(section, fastTracked(reason))).toEqual({
      fastTrackReason: ENTER_REASON,
    });
  });

  it('asks for the reason beside any problem with the date', () => {
    expect(
      sectionFieldErrors(section, {
        ...fastTracked(''),
        publishingDateDay: '31',
        publishingDateMonth: '2',
      }),
    ).toEqual({ publishingDateDay: REAL_DATE, fastTrackReason: ENTER_REASON });
  });

  it('takes a reason left in the form when the box is not ticked', () => {
    expect(
      sectionFieldErrors(section, { ...answers, fastTrackReason: 'Typed, then unticked.' }),
    ).toBeUndefined();
  });

  it('refuses a fast-track answer other than a ticked box', () => {
    expect(sectionFieldErrors(section, { ...answers, fastTracked: 'no' })).toHaveProperty(
      'fastTracked',
    );
  });
});

describe('publishingDateTimeSchema', () => {
  it('takes the date and time alone, as the admin confirms them', () => {
    const { fastTracked: _, fastTrackReason: __, ...dateTime } = answers;

    expect(publishingDateTimeSchema.parse(dateTime)).toEqual(dateTime);
  });
});
