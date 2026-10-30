import { indicatorTaskKeySchema } from '@fphd/internal-api-features/contract';
import { describe, expect, it } from 'vitest';
import { sampleAnswerOptions } from './answers.testing.ts';
import { sampleAnswers } from './answers.ts';

const now = new Date('2026-10-29T12:00:00Z');

describe('sampleAnswers', () => {
  it('answers every task once but the name and the data table', () => {
    const keys = sampleAnswers(sampleAnswerOptions, now).map(({ key }) => key);

    expect(keys.toSorted()).toEqual(
      indicatorTaskKeySchema.options.filter((key) => key !== 'name' && key !== 'data-table').sort(),
    );
  });

  it.each(sampleAnswers(sampleAnswerOptions, now).map((sample) => [sample.key, sample] as const))(
    "gives %s answers its page's schema accepts",
    (_, { schema, answers }) => {
      expect(schema.safeParse(answers).error).toBeUndefined();
    },
  );

  it('chooses from the options the API offers', () => {
    const answers = Object.fromEntries(
      sampleAnswers(sampleAnswerOptions, now).map(({ key, answers }) => [key, answers]),
    );

    expect(answers['value-type-and-units']).toMatchObject({
      valueTypeId: '019a0000-0000-7000-8000-000000000002',
      unitId: '019a0000-0000-7000-8000-000000000004',
    });
    expect(answers['confidence-intervals']).toMatchObject({
      ciMethodId: '019a0000-0000-7000-8000-000000000005',
    });
    expect(answers.numerator).toMatchObject({
      sources: [{ providerId: '019a0000-0000-7000-8000-000000000006', sourceId: null }],
    });
    expect(answers.tagging).toMatchObject({
      topicIds: ['019a0000-0000-7000-8000-000000000007'],
      primaryTopicId: '019a0000-0000-7000-8000-000000000007',
      indicatorTypeIds: ['019a0000-0000-7000-8000-000000000008'],
    });
  });

  it('publishes on 1 April next year', () => {
    const publishingDate = sampleAnswers(sampleAnswerOptions, now).find(
      ({ key }) => key === 'publishing-date',
    );

    expect(publishingDate?.answers).toMatchObject({
      publishingDateDay: '1',
      publishingDateMonth: '4',
      publishingDateYear: '2027',
    });
  });

  it('names an option the API does not offer', () => {
    const options = {
      ...sampleAnswerOptions,
      valueTypesAndUnits: { ...sampleAnswerOptions.valueTypesAndUnits, valueTypes: [] },
    };

    expect(() => sampleAnswers(options, now)).toThrow('The API offers no value type named Count');
  });
});
