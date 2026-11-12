import { describe, expect, it } from 'vitest';

import {
  type IndicatorTaskListReview,
  indicatorTaskKeySchema,
  indicatorTaskListSchema,
} from './contract.ts';
import {
  ciMethodId,
  completeTaskListDraft as complete,
  ons,
} from './indicator-task-list.testing.ts';
import {
  type IndicatorTaskListDraft,
  type IndicatorTaskListSource,
  indicatorTaskList,
  taskListReview,
} from './indicator-task-list.ts';
import type { RevisionRoundRow } from './revision-response-repository.ts';
import { unansweredDraft } from './testing.ts';

// A draft as the name page leaves it: named, with every other answer still to give.
const source: IndicatorTaskListSource = {
  indicator: {
    id: '00000000-0000-7000-8000-000000000001',
    shortId: 90366,
    indicatorStatus: 'new',
    draftStatus: 'draft',
    draftSubmissionStatus: null,
    draftResponseKind: null,
  },
  draft: { ...unansweredDraft, name: 'Life expectancy at birth', ciMethodKind: null },
  published: null,
  review: null,
};

function withDraft(draft: Partial<IndicatorTaskListDraft>): IndicatorTaskListSource {
  return { ...source, draft: { ...source.draft, ...draft } };
}

function withIndicatorStatus(indicatorStatus: 'new' | 'live'): IndicatorTaskListSource {
  return { ...source, indicator: { ...source.indicator, indicatorStatus } };
}

describe('indicatorTaskList', () => {
  it('names the indicator from the draft being edited, beside its statuses', () => {
    const state = indicatorTaskList(withDraft({ name: 'Renamed indicator' }));

    expect(state.indicator).toEqual({
      id: source.indicator.id,
      shortId: 90366,
      name: 'Renamed indicator',
      indicatorStatus: 'new',
      draftStatus: 'draft',
      draftSubmissionStatus: null,
      draftResponseKind: null,
    });
  });

  it('counts the name as complete, which a draft cannot exist without', () => {
    expect(indicatorTaskList(source).tasks.name).toBe('completed');
  });

  const sectionKeys = indicatorTaskKeySchema.options.filter(
    (key) => key !== 'name' && key !== 'data-table',
  );

  // Each section's required answers are its schema's, tested in its contract.
  it.each(sectionKeys)('counts %s as complete once its form would accept its answers', (key) => {
    expect(indicatorTaskList(withDraft(complete)).tasks[key]).toBe('completed');
  });

  it.each(sectionKeys)('leaves %s not started while it is unanswered', (key) => {
    expect(indicatorTaskList(source).tasks[key]).toBe('not_started');
  });

  it.each([
    ['not started before an upload', {}, 'not_started'],
    [
      'in progress once a file has loaded',
      { uploadBatchId: complete.uploadBatchId },
      'in_progress',
    ],
    [
      'complete once the publisher has confirmed it',
      {
        uploadBatchId: complete.uploadBatchId,
        dataTableConfirmedAt: complete.dataTableConfirmedAt,
      },
      'completed',
    ],
  ] satisfies [string, Partial<IndicatorTaskListDraft>, string][])(
    'counts the data table as %s',
    (_, draft, status) => {
      expect(indicatorTaskList(withDraft(draft)).tasks['data-table']).toBe(status);
    },
  );

  it('holds submission back while the data table is unconfirmed', () => {
    expect(
      indicatorTaskList(withDraft({ ...complete, dataTableConfirmedAt: null })).canSubmit,
    ).toBe(false);
  });

  it.each([
    ['its kind is unknown', { ciMethodId, ciMethodKind: null }, 'not_started'],
    [
      'a standard method has no answer on modifications',
      { ciMethodId, ciMethodKind: 'standard', hasCiMethodModifications: null },
      'not_started',
    ],
    [
      'a standard method is modified with no description',
      { ciMethodId, ciMethodKind: 'standard', hasCiMethodModifications: true },
      'not_started',
    ],
    ['an other method has no detail', { ciMethodId, ciMethodKind: 'other' }, 'not_started'],
    [
      'an other method is detailed',
      { ciMethodId, ciMethodKind: 'other', ciMethodDetail: 'Bootstrap intervals' },
      'completed',
    ],
    ['the method has nothing to describe', { ciMethodId, ciMethodKind: 'none' }, 'completed'],
  ] satisfies [string, Partial<IndicatorTaskListDraft>, string][])(
    "judges the confidence intervals by the method's kind when %s",
    (_, draft, status) => {
      expect(indicatorTaskList(withDraft(draft)).tasks['confidence-intervals']).toBe(status);
    },
  );

  it.each([
    ['nothing', {}, 'not_started'],
    ['sources alone', { numeratorSources: [ons] }, 'not_started'],
    ['a definition alone', { numeratorDefinition: complete.numeratorDefinition }, 'not_started'],
    [
      'sources and a definition',
      { numeratorSources: [ons], numeratorDefinition: complete.numeratorDefinition },
      'completed',
    ],
  ] satisfies [string, Partial<IndicatorTaskListDraft>, string][])(
    'judges the numerator with %s',
    (_, draft, status) => {
      expect(indicatorTaskList(withDraft(draft)).tasks.numerator).toBe(status);
    },
  );

  it.each([
    ['without the reasons', null, 'not_started'],
    ['with the reasons', 'No tool reads this source.', 'completed'],
  ] as const)(
    'judges the justifications of a no to automation tools %s',
    (_, noAutomationReason, status) => {
      const draft = { hasAutomation: false, automationDetail: null, noAutomationReason };

      expect(indicatorTaskList(withDraft({ ...complete, ...draft })).tasks.justifications).toBe(
        status,
      );
    },
  );

  // A version imported from Fingertips may have either answer without a reason, and a new draft
  // made from it asks for one before it can be submitted.
  it.each([
    ['no-fixed-frequency', null, 'not_started', false],
    ['no-fixed-frequency', 'Published when the survey runs.', 'completed', true],
    ['no-longer-updated', null, 'not_started', false],
    ['no-longer-updated', 'The survey has ended.', 'completed', true],
  ] as const)(
    'judges an update frequency of %s with the reason %j',
    (updateFrequency, updateFrequencyReason, status, canSubmit) => {
      const taskList = indicatorTaskList(
        withDraft({ ...complete, updateFrequency, updateFrequencyReason }),
      );

      expect(taskList.tasks['update-frequency']).toBe(status);
      expect(taskList.canSubmit).toBe(canSubmit);
    },
  );

  // A draft saved when one page asked both has both or neither. Imported versions have neither.
  it.each([
    [
      'what was collected alone',
      { demographics: complete.demographics, sexes: complete.sexes },
      'completed',
      'not_started',
    ],
    [
      'the ages alone',
      { ageType: complete.ageType, ageRanges: complete.ageRanges },
      'not_started',
      'completed',
    ],
    ['both', complete, 'completed', 'completed'],
  ] satisfies [string, Partial<IndicatorTaskListDraft>, string, string][])(
    'judges sex, gender and ethnicity apart from the ages, given %s',
    (_, draft, sexStatus, agesStatus) => {
      const { tasks } = indicatorTaskList(withDraft(draft));

      expect([tasks['sex-gender-and-ethnicity'], tasks.ages]).toEqual([sexStatus, agesStatus]);
    },
  );

  it('judges the denominator from its own answers', () => {
    const numeratorOnly = { numeratorSources: [ons], numeratorDefinition: 'Deaths' };

    expect(indicatorTaskList(withDraft(numeratorOnly)).tasks.denominator).toBe('not_started');
    expect(indicatorTaskList(withDraft(complete)).tasks.denominator).toBe('completed');
  });

  it.each([
    ['new', false],
    ['live', true],
  ] as const)('reports a draft of a %s indicator as an update: %s', (status, isUpdate) => {
    expect(indicatorTaskList(withIndicatorStatus(status)).isUpdate).toBe(isUpdate);
  });

  it('allows submission once every task is complete', () => {
    expect(indicatorTaskList(withDraft(complete)).canSubmit).toBe(true);
  });

  it('allows a new indicator submission without an update summary, which only an update has', () => {
    expect(indicatorTaskList(withDraft({ ...complete, updateSummary: null })).canSubmit).toBe(true);
  });

  it('holds submission back while any task is not started', () => {
    expect(indicatorTaskList(source).canSubmit).toBe(false);
  });

  it('answers in the shape the contract describes', () => {
    const shape = indicatorTaskListSchema.omit({
      draftUpdatedAt: true,
      editable: true,
      actions: true,
    });

    expect(shape.safeParse(indicatorTaskList(source)).success).toBe(true);
  });
});

describe('the changes an update makes', () => {
  // A live indicator whose draft is still as the published version it was opened from.
  const update: IndicatorTaskListSource = {
    ...source,
    indicator: { ...source.indicator, indicatorStatus: 'live' },
    draft: { ...complete, updateSummary: null, scheduledPublishAt: null },
    published: complete,
  };

  function withChange(draft: Partial<IndicatorTaskListDraft>): IndicatorTaskListSource {
    return { ...update, draft: { ...update.draft, ...draft } };
  }

  it('lists no change while the draft answers every task as the published version does', () => {
    expect(indicatorTaskList(update).changedTasks).toEqual([]);
  });

  it.each([
    ['name', { name: 'Healthy life expectancy at birth' }],
    ['data-table', { uploadBatchId: '019fa38f-073f-764e-9ac6-1c4d03b1cb94' }],
    ['definition-and-rationale', { rationale: 'A summary measure of health.' }],
    ['polarity', { polarity: 'higher-is-better' }],
    ['numerator', { numeratorSources: [] }],
    ['update-frequency', { updateFrequency: 'annually' }],
    ['variance-and-quality', { variation: 'Varies little.' }],
    ['tagging', { topicIds: [...complete.topicIds, '019fa38f-073f-764e-9ac6-1c4d03b10004'] }],
    ['ages', { ageType: 'all' }],
  ] satisfies [string, Partial<IndicatorTaskListDraft>][])(
    'lists %s once its answers differ from the published version',
    (key, draft) => {
      expect(indicatorTaskList(withChange(draft)).changedTasks).toEqual([key]);
    },
  );

  it('lists a task saved back to its published answers as unchanged', () => {
    expect(indicatorTaskList(withChange({ polarity: complete.polarity })).changedTasks).toEqual([]);
  });

  it('never lists the publishing date or the update summary, which every update answers', () => {
    const answered = withChange({
      scheduledPublishAt: new Date('2028-01-10T09:30:00.000Z'),
      updateSummary: 'Added the 2025 data.',
    });

    expect(indicatorTaskList(answered).changedTasks).toEqual([]);
  });

  it('judges the publishing date and the update summary by their own answers', () => {
    const { tasks } = indicatorTaskList(update);

    expect([tasks['publishing-date'], tasks['update-summary']]).toEqual([
      'not_started',
      'not_started',
    ]);
  });

  it('holds back an update without its summary', () => {
    const dated = withChange({ scheduledPublishAt: complete.scheduledPublishAt });

    expect(indicatorTaskList(dated).canSubmit).toBe(false);
    expect(
      indicatorTaskList(withChange({ ...dated.draft, updateSummary: 'Added the 2025 data.' }))
        .canSubmit,
    ).toBe(true);
  });

  it('lists no change for a new indicator, which has nothing published', () => {
    expect(indicatorTaskList(withDraft(complete)).changedTasks).toEqual([]);
  });
});

describe('resubmitting a draft sent back', () => {
  const review: IndicatorTaskListReview = {
    kind: 'minor_revisions',
    clarificationRequest: null,
    flags: [
      { task: 'polarity', notes: 'Is higher better?', reviewerName: 'Sam Reviewer', cleared: true },
    ],
    revisionResponse: 'Higher is better',
  };
  const sentBack = (changes: Partial<IndicatorTaskListReview>) => ({
    ...withDraft(complete),
    review: { ...review, ...changes },
  });

  it('is allowed once every flag is saved and the reply written', () => {
    expect(indicatorTaskList(sentBack({})).canSubmit).toBe(true);
  });

  it('is held back while a flagged task is unsaved', () => {
    const flags = [
      ...review.flags,
      { task: 'name' as const, notes: 'Shorter', reviewerName: 'Sam Reviewer', cleared: false },
    ];

    expect(indicatorTaskList(sentBack({ flags })).canSubmit).toBe(false);
  });

  it.each([null, '  '])('is held back while the reply is %o', (revisionResponse) => {
    expect(indicatorTaskList(sentBack({ revisionResponse })).canSubmit).toBe(false);
  });

  it('is held back while any task is not complete', () => {
    expect(indicatorTaskList({ ...source, review }).canSubmit).toBe(false);
  });

  it('answers the round as it was given', () => {
    expect(indicatorTaskList(sentBack({})).review).toEqual(review);
  });
});

describe('taskListReview', () => {
  const round: RevisionRoundRow = {
    hasDraft: true,
    draftLocked: false,
    submissionNumber: 1,
    submissionStatus: 'changes_requested',
    kind: 'major_revisions',
    clarificationRequest: { notes: 'Which years?', reviewerName: 'Sam Reviewer' },
    revisionResponse: null,
    flags: [
      {
        task: 'polarity',
        notes: 'Is higher better?',
        reviewerName: 'Sam Reviewer',
        cleared: false,
      },
    ],
  };

  it('takes the round that sent the draft back', () => {
    expect(taskListReview(round)).toEqual({
      kind: 'major_revisions',
      clarificationRequest: round.clarificationRequest,
      flags: round.flags,
      revisionResponse: null,
    });
  });

  it.each([
    ['no indicator', undefined],
    ['a draft never submitted', { ...round, submissionStatus: null, kind: null }],
    ['a draft in review', { ...round, submissionStatus: 'in_review' as const, kind: null }],
    [
      'an approved draft',
      { ...round, submissionStatus: 'approved' as const, kind: 'approved' as const },
    ],
  ])('is null for %s', (_case, found) => {
    expect(taskListReview(found)).toBeNull();
  });
});
