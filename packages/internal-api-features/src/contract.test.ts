import { z } from '@fphd/config/zod';
import { describe, expect, it } from 'vitest';

import {
  definitionAndRationaleSection,
  indicatorAccess,
  indicatorCreateErrorSchema,
  indicatorFieldSchema,
  indicatorNameSchema,
  indicatorSectionErrorSchema,
  indicatorTaskKeySchema,
  indicatorTaskListSchema,
  indicatorUpdateErrorSchema,
  sexAndAgesSection,
  toFieldErrors,
  topicFieldSchema,
  topicUpdateErrorSchema,
  topicUpdateSchema,
} from './contract.ts';

describe('indicatorAccess', () => {
  it('takes the team and the ids of the assigned reviewers', () => {
    const teamId = '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b';
    const reviewer = { id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5c', name: 'Jamie Evans' };

    expect(indicatorAccess({ teamId, draftReviewers: [reviewer] })).toEqual({
      teamId,
      reviewerIds: [reviewer.id],
    });
  });
});

describe('indicatorNameSchema', () => {
  it('takes the name as typed, without its surrounding spaces', () => {
    const result = indicatorNameSchema.safeParse({ name: '  Life expectancy at birth  ' });

    expect(result.success && result.data).toEqual({ name: 'Life expectancy at birth' });
  });

  it.each(['', '   '])('asks for a name when %o is submitted', (name) => {
    const result = indicatorNameSchema.safeParse({ name });

    expect(result.success).toBe(false);
    expect(!result.success && toFieldErrors(result.error, indicatorFieldSchema)).toEqual({
      name: 'Enter the name of the indicator',
    });
  });

  it.each(['108', ' 2024 ', '2,024'])('refuses %o, which would read as a short id', (name) => {
    const result = indicatorNameSchema.safeParse({ name });

    expect(result.success).toBe(false);
    expect(!result.success && toFieldErrors(result.error, indicatorFieldSchema)).toEqual({
      name: 'Enter a name that is not only numbers',
    });
  });

  it.each(['!!!', '???  %%%'])('refuses %o, which leaves no slug at all', (name) => {
    const result = indicatorNameSchema.safeParse({ name });

    expect(result.success).toBe(false);
    expect(!result.success && toFieldErrors(result.error, indicatorFieldSchema)).toEqual({
      name: 'Enter a name that includes letters or numbers',
    });
  });

  it.each(['search', 'Compare', 'facets'])('refuses %o, which the service uses', (name) => {
    const result = indicatorNameSchema.safeParse({ name });

    expect(result.success).toBe(false);
    expect(!result.success && toFieldErrors(result.error, indicatorFieldSchema)).toEqual({
      name: 'Enter a different name, this one is reserved for the service',
    });
  });

  it.each(['Covid-19 deaths', '2024 births', 'Obesity', 'life-expectancy'])(
    'accepts %o',
    (name) => {
      expect(indicatorNameSchema.safeParse({ name }).success).toBe(true);
    },
  );

  it('accepts a name of 300 characters, measured once trimmed', () => {
    const name = ` ${'a'.repeat(300)} `;

    expect(indicatorNameSchema.safeParse({ name }).success).toBe(true);
  });

  it('refuses a name of 301 characters', () => {
    const result = indicatorNameSchema.safeParse({ name: 'a'.repeat(301) });

    expect(result.success).toBe(false);
    expect(!result.success && toFieldErrors(result.error, indicatorFieldSchema)).toEqual({
      name: 'Indicator name must be 300 characters or fewer',
    });
  });

  it('rejects a submission with no name at all', () => {
    expect(indicatorNameSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a name that is not text', () => {
    expect(indicatorNameSchema.safeParse({ name: 108 }).success).toBe(false);
  });
});

describe('toFieldErrors', () => {
  function topicErrors(submission: unknown) {
    const result = topicUpdateSchema.safeParse(submission);
    if (result.success) throw new Error('expected the submission to be refused');
    return toFieldErrors(result.error, topicFieldSchema);
  }

  it('reports one message per field, in the order the schema states them', () => {
    expect(topicErrors({ title: '', slug: 'Not A Slug', description: '' })).toEqual({
      title: 'Enter a topic name',
      slug: 'Slug must be lowercase letters or numbers, separated by hyphens',
      description: 'Enter a description',
    });
  });

  it('keeps the first message when a value breaks two rules', () => {
    expect(topicErrors({ title: 'A topic', slug: '', description: 'About it.' })).toEqual({
      slug: 'Enter a slug',
    });
  });

  it('drops an issue on a field the form does not show', () => {
    const result = topicUpdateSchema.safeParse({ title: '', slug: 'a-slug', description: 'A.' });
    if (result.success) throw new Error('expected the submission to be refused');
    const [reported] = result.error.issues;
    if (reported === undefined) throw new Error('expected an issue to copy');
    result.error.issues.push({ ...reported, path: ['unknown'] });

    expect(toFieldErrors(result.error, topicFieldSchema)).toEqual({
      title: 'Enter a topic name',
    });
  });

  it("names a list item's field where the keys name it, and the list where they do not", () => {
    const schema = z.object({
      items: z.array(z.object({ name: z.string().min(1, 'Enter a name') })),
    });
    const result = schema.safeParse({ items: [{ name: 'A' }, { name: '' }] });
    if (result.success) throw new Error('expected the submission to be refused');
    const itemKeys = z.templateLiteral(['items[', z.number().int(), '].name']);

    expect(toFieldErrors(result.error, itemKeys)).toEqual({ 'items[1].name': 'Enter a name' });
    expect(toFieldErrors(result.error, z.enum(['items']))).toEqual({ items: 'Enter a name' });
  });
});

describe.each([
  ['topicUpdateErrorSchema', topicUpdateErrorSchema, ['validation_failed', 'slug_taken']],
  ['indicatorCreateErrorSchema', indicatorCreateErrorSchema, ['validation_failed', 'slug_taken']],
  ['indicatorUpdateErrorSchema', indicatorUpdateErrorSchema, ['validation_failed', 'slug_taken']],
  [
    'indicatorSectionErrorSchema',
    indicatorSectionErrorSchema(definitionAndRationaleSection),
    ['validation_failed'],
  ],
])('%s', (_name, schema, refusals) => {
  it.each(refusals)('requires %s to name its fields', (error) => {
    expect(schema.safeParse({ error }).success).toBe(false);
    expect(schema.safeParse({ error, fieldErrors: {} }).success).toBe(true);
  });
});

describe('indicatorSectionErrorSchema', () => {
  it("accepts a refusal of a list item's field from a section that names them", () => {
    const fieldErrors = { 'ageRanges[1].lowerLimit': 'Enter lower limit 2' };

    expect(
      indicatorSectionErrorSchema(sexAndAgesSection).safeParse({
        error: 'validation_failed',
        fieldErrors,
      }).success,
    ).toBe(true);
    expect(
      indicatorSectionErrorSchema(definitionAndRationaleSection).safeParse({
        error: 'validation_failed',
        fieldErrors,
      }).success,
    ).toBe(false);
  });
});

describe('invalid_id', () => {
  it.each([
    topicUpdateErrorSchema,
    indicatorUpdateErrorSchema,
    indicatorSectionErrorSchema(definitionAndRationaleSection),
  ])('is accepted with no fields, as no field is at fault', (schema) => {
    expect(schema.safeParse({ error: 'invalid_id' }).success).toBe(true);
  });
});

describe('indicatorTaskListSchema', () => {
  const tasks = Object.fromEntries(indicatorTaskKeySchema.options.map((key) => [key, 'completed']));
  const state = {
    indicator: {
      id: '00000000-0000-7000-8000-000000000001',
      shortId: 90366,
      name: 'An indicator',
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftSubmissionStatus: null,
    },
    isUpdate: false,
    canSubmit: true,
    tasks,
    draftUpdatedAt: '2026-10-22T09:30:00.123Z',
    editable: true,
    actions: ['submit'],
  };

  it('requires every task', () => {
    const { name: _name, ...withoutName } = tasks;

    expect(indicatorTaskListSchema.safeParse(state).success).toBe(true);
    expect(indicatorTaskListSchema.safeParse({ ...state, tasks: withoutName }).success).toBe(false);
  });

  it.each(['not_started', 'completed'])('accepts a task status of %s', (status) => {
    expect(
      indicatorTaskListSchema.safeParse({ ...state, tasks: { ...tasks, name: status } }).success,
    ).toBe(true);
  });

  it('refuses a status the vocabulary does not hold yet', () => {
    expect(
      indicatorTaskListSchema.safeParse({ ...state, tasks: { ...tasks, name: 'incomplete' } })
        .success,
    ).toBe(false);
  });

  it('refuses a task the API does not judge', () => {
    expect(
      indicatorTaskListSchema.safeParse({
        ...state,
        tasks: { ...tasks, 'not-a-task': 'completed' },
      }).success,
    ).toBe(false);
  });

  it('requires the indicator the tasks belong to', () => {
    const { indicator: _indicator, ...withoutIndicator } = state;

    expect(indicatorTaskListSchema.safeParse(withoutIndicator).success).toBe(false);
  });
});
