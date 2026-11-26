import { describe, expect, it, vi } from 'vitest';
import { formatAndSourcesSection, publishingDateSection, toFieldErrors } from './contract.ts';
import {
  confidenceIntervalsServerSection,
  formatAndSourcesServerSection,
  publishingDateServerSection,
  taggingServerSection,
  valueTypeAndUnitsServerSection,
} from './indicator-section-validators.ts';
import {
  everyAnswer,
  formatAndSources,
  METHODS,
  mortality,
  ons,
  onsAlone,
  publishingDate,
  TAGS,
  tagging,
  tagOptions,
} from './indicator-sections.testing.ts';
import { createFakeInternalRepositories } from './testing.ts';

describe('taggingServerSection', () => {
  async function fieldErrorsOf(body: object, options = tagOptions) {
    const { tags } = createFakeInternalRepositories({
      tags: { listOptions: vi.fn().mockResolvedValue(options) },
    });
    const section = taggingServerSection(tags);
    const result = await section.schema.safeParseAsync(body);
    return result.success ? undefined : toFieldErrors(result.error, section.fields);
  }

  it('accepts tags the page offers', async () => {
    expect(await fieldErrorsOf(tagging)).toBeUndefined();
  });

  it('refuses a tag offered under another question, or not at all', async () => {
    expect(
      await fieldErrorsOf({
        ...tagging,
        topicIds: [TAGS.type],
        lifeStageIds: ['019fa38f-073f-764e-9ac6-1c4d03b10999'],
        hasFramework: 'yes',
        frameworkIds: [TAGS.topic],
        hasRiskFactor: 'yes',
        riskFactorIds: [TAGS.lifeStage],
      }),
    ).toEqual({
      topicIds: 'Select a topic from the list',
      frameworkIds: 'Select a framework or programme from the list',
      lifeStageIds: 'Select a life stage from the list',
      riskFactorIds: 'Select a risk factor from the list',
    });
  });

  it('does not judge the tags beside a "No", which are dropped', async () => {
    expect(
      await fieldErrorsOf({ ...tagging, hasLifeStage: 'no', lifeStageIds: [TAGS.topic] }),
    ).toBeUndefined();
  });

  describe('subtopics', () => {
    const child = '019fa38f-073f-764e-9ac6-1c4d03b10100';
    const options = {
      ...tagOptions,
      subtopics: [{ id: child, name: 'A subtopic', topicId: TAGS.topic }],
    };

    it('accepts a subtopic under a topic added', async () => {
      expect(await fieldErrorsOf({ ...tagging, subtopicIds: [child] }, options)).toBeUndefined();
    });

    it('refuses a subtopic whose topic is not added', async () => {
      expect(
        await fieldErrorsOf(
          { ...tagging, topicIds: [TAGS.otherTopic], subtopicIds: [child] },
          options,
        ),
      ).toEqual({ subtopicIds: 'Select subtopics belonging to the topics added' });
    });

    it('refuses a topic that has subtopics without one of them', async () => {
      expect(await fieldErrorsOf(tagging, options)).toEqual({
        subtopicIds: 'Select a subtopic for Alcohol',
      });
    });
  });
});

describe('confidenceIntervalsServerSection', () => {
  function submit(
    body: object,
    findById = vi.fn(async (id: string) =>
      Object.values(METHODS).find((method) => method.id === id),
    ),
  ) {
    const { ciMethods } = createFakeInternalRepositories({ ciMethods: { findById } });
    const section = confidenceIntervalsServerSection(ciMethods);

    return { findById, submission: section.schema.safeParseAsync(body), section };
  }

  async function fieldErrorsOf(body: object) {
    const { section, submission } = submit(body);
    const result = await submission;
    return result.success ? undefined : toFieldErrors(result.error, section.fields);
  }

  it('adds the kind of the chosen method', async () => {
    const result = await submit({ ...everyAnswer, ciMethodId: METHODS.other.id }).submission;

    expect(result.success && result.data.kind).toBe('other');
  });

  it('refuses a method the list no longer holds, asking for another', async () => {
    expect(
      await fieldErrorsOf({ ...everyAnswer, ciMethodId: '00000000-0000-7000-8000-000000000999' }),
    ).toEqual({
      ciMethodId:
        'The confidence interval method saved is no longer available. Select another method',
    });
  });

  it('refuses an unchosen method without looking for it', async () => {
    const { findById, submission } = submit({ ...everyAnswer, ciMethodId: '' });

    expect((await submission).success).toBe(false);
    expect(findById).not.toHaveBeenCalled();
  });

  it("refuses what the chosen method's kind asks for and was not given", async () => {
    expect(
      await fieldErrorsOf({
        ciMethodId: METHODS.standard.id,
        hasCiMethodModifications: '',
        ciMethodModificationsDetail: '',
        ciMethodDetail: '',
      }),
    ).toEqual({
      hasCiMethodModifications:
        'Select whether any modifications to the described method were used',
    });
  });
});

describe('valueTypeAndUnitsServerSection', () => {
  const options = {
    valueTypes: [{ id: '01a0d8a5-3ca2-7315-bfca-96d2031a65e7', name: 'Proportion' }],
    units: [{ id: '01a0d8a5-3ca2-7315-bfca-96d615820bd4', name: '%' }],
  };
  const answers = {
    valueTypeId: '01a0d8a5-3ca2-7315-bfca-96d2031a65e7',
    standardPopulation: '',
    standardPopulationOther: '',
    referencePopulation: '',
    unitId: '01a0d8a5-3ca2-7315-bfca-96d615820bd4',
    unitDetail: '',
  };

  function submit(body: object) {
    const listOptions = vi.fn().mockResolvedValue(options);
    const { valueTypesAndUnits } = createFakeInternalRepositories({
      valueTypesAndUnits: { listOptions },
    });
    const section = valueTypeAndUnitsServerSection(valueTypesAndUnits);

    return { listOptions, section, submission: section.schema.safeParseAsync(body) };
  }

  async function fieldErrorsOf(body: object) {
    const { section, submission } = submit(body);
    const result = await submission;
    return result.success ? undefined : toFieldErrors(result.error, section.fields);
  }

  it('accepts a value type and unit the page offers', async () => {
    expect(await fieldErrorsOf(answers)).toBeUndefined();
  });

  it('refuses a value type or unit the page does not offer', async () => {
    const missing = '00000000-0000-7000-8000-000000000999';

    expect(await fieldErrorsOf({ ...answers, valueTypeId: missing, unitId: missing })).toEqual({
      valueTypeId: 'Select the value type',
      unitId: 'Select the units',
    });
  });

  it('refuses an unchosen value type without reading the options', async () => {
    const { listOptions, submission } = submit({ ...answers, valueTypeId: '' });

    expect((await submission).success).toBe(false);
    expect(listOptions).not.toHaveBeenCalled();
  });
});

describe('publishingDateServerSection', () => {
  // 09:30 BST on 14 September 2027.
  const now = new Date('2027-09-14T08:30:00.000Z');

  function submit(body: object, at: Date = now) {
    return publishingDateServerSection(() => at).schema.safeParse(body);
  }

  function fieldErrorsOf(body: object, at: Date = now) {
    const result = submit(body, at);
    return result.success ? undefined : toFieldErrors(result.error, publishingDateSection.fields);
  }

  function dated(day: string, month: string, year = '2027') {
    return {
      ...publishingDate,
      publishingDateDay: day,
      publishingDateMonth: month,
      publishingDateYear: year,
    };
  }

  function fastTracked(body: object) {
    return { ...body, fastTracked: 'yes', fastTrackReason: 'For a ministerial briefing.' };
  }

  function onTheDate(message: string) {
    return {
      publishingDateDay: message,
      publishingDateMonth: message,
      publishingDateYear: message,
    };
  }

  it('adds the instant the UK date and time name, 8 weeks ahead', () => {
    const result = submit(dated('9', '11'));

    expect(result.success && result.data.scheduledPublishAt).toEqual(
      new Date('2027-11-09T09:30:00.000Z'),
    );
  });

  it.each([
    ['55 days from today', dated('8', '11')],
    ['today', dated('14', '9')],
    ['in the past', dated('13', '9')],
  ])('refuses a date %s, on the parts of the date', (_, body) => {
    expect(fieldErrorsOf(body)).toEqual(
      onTheDate('Publishing date and time must be at least 8 weeks in the future'),
    );
  });

  it('accepts any time on the date 8 weeks from today', () => {
    // Less than 56 × 24 hours after 09:30 on 14 September.
    const midnight = { ...dated('9', '11'), publishingTimeHour: '00', publishingTimeMinute: '00' };

    expect(submit(midnight).success).toBe(true);
  });

  it("counts from today's date in the UK", () => {
    // 00:30 BST on 15 September, still 14 September in UTC.
    const lateEvening = new Date('2027-09-14T23:30:00.000Z');

    expect(fieldErrorsOf(dated('9', '11'), lateEvening)).toBeDefined();
    expect(submit(dated('10', '11'), lateEvening).success).toBe(true);
  });

  it('counts calendar days across a clock change', () => {
    // 09:30 GMT on 5 March; 09:30 BST on 30 April is an hour short of 56 × 24 hours later.
    const march = new Date('2027-03-05T09:30:00.000Z');

    expect(submit(dated('30', '4'), march).success).toBe(true);
  });

  it('accepts a fast-tracked date inside the notice period, with its reason', () => {
    const result = submit(fastTracked(dated('15', '9')));

    expect(result.success && result.data).toMatchObject({
      fastTracked: 'yes',
      fastTrackReason: 'For a ministerial briefing.',
      scheduledPublishAt: new Date('2027-09-15T08:30:00.000Z'),
    });
  });

  it('accepts a fast-tracked time later today', () => {
    const laterToday = {
      ...dated('14', '9'),
      publishingTimeHour: '09',
      publishingTimeMinute: '31',
    };

    expect(submit(fastTracked(laterToday)).success).toBe(true);
  });

  it.each([
    ['now', dated('14', '9')],
    [
      'earlier today',
      { ...dated('14', '9'), publishingTimeHour: '09', publishingTimeMinute: '29' },
    ],
    ['yesterday', dated('13', '9')],
  ])('refuses a fast-tracked date and time %s, on the parts of the date', (_, body) => {
    expect(fieldErrorsOf(fastTracked(body))).toEqual(
      onTheDate('Publishing date and time must be in the future'),
    );
  });

  it('refuses a time the spring clock change skips, on the parts of the time', () => {
    const skipped = { ...dated('26', '3', '2028'), publishingTimeHour: '01' };

    expect(fieldErrorsOf(skipped)).toEqual({
      publishingTimeHour: 'Publishing time must be a real time',
      publishingTimeMinute: 'Publishing time must be a real time',
    });
  });

  it('takes a time the autumn clock change repeats as its second, GMT, occurrence', () => {
    const repeated = { ...dated('29', '10', '2028'), publishingTimeHour: '01' };
    const result = submit(repeated);

    expect(result.success && result.data.scheduledPublishAt).toEqual(
      new Date('2028-10-29T01:30:00.000Z'),
    );
  });
});

describe('formatAndSourcesServerSection', () => {
  const notOffered = { providerId: ons.id, sourceId: '01a0d858-9885-764e-8d53-6826aec67999' };

  function submit(body: object) {
    const list = vi.fn().mockResolvedValue([ons]);
    const { dataProviders } = createFakeInternalRepositories({ dataProviders: { list } });
    const section = formatAndSourcesServerSection(formatAndSourcesSection, dataProviders);

    return { list, section, submission: section.schema.safeParseAsync(body) };
  }

  async function fieldErrorsOf(body: object) {
    const { section, submission } = submit(body);
    const result = await submission;
    return result.success
      ? undefined
      : toFieldErrors(result.error, section.errorFields ?? section.fields);
  }

  it('accepts sources the providers list offers', async () => {
    const body = { ...formatAndSources, numeratorSources: [mortality, onsAlone] };

    expect((await submit(body).submission).data).toEqual(body);
  });

  it('refuses a numerator source the providers list no longer offers, asking for it removed', async () => {
    expect(
      await fieldErrorsOf({ ...formatAndSources, numeratorSources: [mortality, notOffered] }),
    ).toEqual({
      numeratorSources:
        'Remove the data source that is no longer available, then add another if you need one',
    });
  });

  it("refuses a data value's source the providers list no longer offers", async () => {
    const dataValue = {
      sources: [onsAlone],
      definition: 'Admissions',
      disclosureControl: 'not-applicable',
      disclosureControlDetail: '',
    };

    expect(
      await fieldErrorsOf({
        ...formatAndSources,
        hasNumeratorDenominator: 'no',
        dataValues: [dataValue, { ...dataValue, sources: [notOffered] }],
      }),
    ).toEqual({
      'dataValues[1].sources':
        'Remove the data source that is no longer available, then add another if you need one',
    });
  });

  it('does not judge the sources of the branch not chosen, which are dropped', async () => {
    expect(
      await fieldErrorsOf({
        ...formatAndSources,
        dataValues: [
          {
            sources: [notOffered],
            definition: '',
            disclosureControl: '',
            disclosureControlDetail: '',
          },
        ],
      }),
    ).toBeUndefined();
  });

  it('refuses an incomplete form without reading the providers', async () => {
    const { list, submission } = submit({ ...formatAndSources, numeratorSources: [] });

    expect((await submission).success).toBe(false);
    expect(list).not.toHaveBeenCalled();
  });
});
