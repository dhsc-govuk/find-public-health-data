import { VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it } from 'vitest';
import {
  calculationColumns,
  confidenceIntervalsColumns,
  definitionAndRationaleColumns,
  justificationsColumns,
  otherCommentsColumns,
  otherNotesAndCaveatsColumns,
  periodTypeColumns,
  polarityColumns,
  publishingDateColumns,
  sexGenderAndEthnicityColumns,
  updateFrequencyColumns,
  updateSummaryColumns,
  valueTypeAndUnitsColumns,
  varianceAndQualityColumns,
} from './indicator-section-columns.ts';
import { everyAnswer, METHODS, publishingDate } from './indicator-sections.testing.ts';
import { unansweredDraft } from './testing.ts';

describe('definitionAndRationaleColumns', () => {
  it('reads and writes the columns of the same name', () => {
    const answers = { definition: 'A definition', rationale: 'A rationale' };

    expect(definitionAndRationaleColumns.fromDraft({ ...unansweredDraft, ...answers })).toEqual(
      answers,
    );
    expect(definitionAndRationaleColumns.toAttributes(answers)).toEqual(answers);
  });
});

describe('polarityColumns', () => {
  it('reads and writes the column of the same name', () => {
    expect(polarityColumns.fromDraft({ ...unansweredDraft, polarity: 'no-polarity' })).toEqual({
      polarity: 'no-polarity',
    });
    expect(polarityColumns.toAttributes({ polarity: 'no-polarity' })).toEqual({
      polarity: 'no-polarity',
    });
  });
});

describe('updateFrequencyColumns', () => {
  const typed = {
    updateFrequencyYears: '3',
    updateFrequencyText: 'Annual measurements, published in winter.',
    noFixedFrequencyReason: 'Published when the survey runs.',
    noLongerUpdatedReason: 'The survey has ended.',
  };

  it.each([
    ['annually', {}],
    ['every-n-years', { updateFrequencyYears: 3 }],
    ['other', { updateFrequencyText: 'Annual measurements, published in winter.' }],
    ['no-fixed-frequency', { updateFrequencyReason: 'Published when the survey runs.' }],
    ['no-longer-updated', { updateFrequencyReason: 'The survey has ended.' }],
  ] as const)('keeps the details typed under %s alone', (updateFrequency, kept) => {
    expect(updateFrequencyColumns.toAttributes({ updateFrequency, ...typed })).toEqual({
      updateFrequency,
      updateFrequencyYears: null,
      updateFrequencyText: null,
      updateFrequencyReason: null,
      ...kept,
    });
  });

  it('reads a frequency that has no details, leaving them all empty', () => {
    expect(
      updateFrequencyColumns.fromDraft({ ...unansweredDraft, updateFrequency: 'annually' }),
    ).toEqual({
      updateFrequency: 'annually',
      updateFrequencyYears: null,
      updateFrequencyText: null,
      noFixedFrequencyReason: null,
      noLongerUpdatedReason: null,
    });
  });

  it('reads the number of years as the form gives it', () => {
    expect(
      updateFrequencyColumns.fromDraft({
        ...unansweredDraft,
        updateFrequency: 'every-n-years',
        updateFrequencyYears: 3,
      }),
    ).toMatchObject({ updateFrequency: 'every-n-years', updateFrequencyYears: '3' });
  });

  it.each([
    ['no-fixed-frequency', 'noFixedFrequencyReason', 'noLongerUpdatedReason'],
    ['no-longer-updated', 'noLongerUpdatedReason', 'noFixedFrequencyReason'],
  ] as const)(
    'shows the reason for %s under that answer alone',
    (updateFrequency, shown, empty) => {
      expect(
        updateFrequencyColumns.fromDraft({
          ...unansweredDraft,
          updateFrequency,
          updateFrequencyReason: 'The survey has ended.',
        }),
      ).toEqual({
        updateFrequency,
        updateFrequencyYears: null,
        updateFrequencyText: null,
        [shown]: 'The survey has ended.',
        [empty]: null,
      });
    },
  );
});

describe('periodTypeColumns', () => {
  const years = 'years';
  const specified = 'specified-end-date';

  it('reads the year end as the form gives it', () => {
    expect(
      periodTypeColumns.fromDraft({
        ...unansweredDraft,
        periodType: years,
        yearType: specified,
        yearEndDay: 31,
        yearEndMonth: 7,
      }),
    ).toEqual({
      periodType: years,
      yearType: specified,
      yearEndDay: '31',
      yearEndMonth: '7',
      publishedFrom: null,
    });
  });

  it('writes the year end of a year ending on a specified date', () => {
    expect(
      periodTypeColumns.toAttributes({
        periodType: years,
        yearType: specified,
        yearEndDay: '31',
        yearEndMonth: '07',
        publishedFrom: '',
      }),
    ).toEqual({
      periodType: years,
      yearType: specified,
      yearEndDay: 31,
      yearEndMonth: 7,
      publishedFrom: null,
    });
  });

  it('clears a year end the year type does not ask for', () => {
    expect(
      periodTypeColumns.toAttributes({
        periodType: 'quarters',
        yearType: 'financial',
        yearEndDay: '31',
        yearEndMonth: '7',
        publishedFrom: '',
      }),
    ).toEqual({
      periodType: 'quarters',
      yearType: 'financial',
      yearEndDay: null,
      yearEndMonth: null,
      publishedFrom: null,
    });
  });

  it('clears the year type and year end of months', () => {
    expect(
      periodTypeColumns.toAttributes({
        periodType: 'months',
        yearType: specified,
        yearEndDay: '31',
        yearEndMonth: '7',
        publishedFrom: '',
      }),
    ).toEqual({
      periodType: 'months',
      yearType: null,
      yearEndDay: null,
      yearEndMonth: null,
      publishedFrom: null,
    });
  });
});

describe('valueTypeAndUnitsColumns', () => {
  const DSR = VALUE_TYPE_IDS.directlyStandardisedRate;
  const ISR = VALUE_TYPE_IDS.indirectlyStandardisedRatio;
  // Every follow-up filled in, as a form without JavaScript may send them.
  const everyFollowUp = {
    standardPopulation: 'other',
    standardPopulationOther: 'England 2021',
    referencePopulation: 'England 2019',
    hasCount: 'yes',
    countMeasure: 'other',
    countMeasureDetail: 'beds',
    countIsEstimate: 'yes',
    ratePer: '1000',
    rateObject: 'other',
    rateObjectDetail: 'procedures',
    valueSameAsCount: 'no',
    valueMeasure: 'other',
    valueMeasureDetail: 'patients',
    gapObject: 'other',
    gapObjectDetail: 'regions',
    ratioFormat: 'percentage',
  } as const;
  const nothingMore = {
    standardPopulation: null,
    standardPopulationDetail: null,
    hasCount: null,
    countMeasure: null,
    countMeasureDetail: null,
    countIsEstimate: null,
    ratePer: null,
    rateObject: null,
    rateObjectDetail: null,
    valueSameAsCount: null,
    valueMeasure: null,
    valueMeasureDetail: null,
    gapObject: null,
    gapObjectDetail: null,
    ratioFormat: null,
  };

  it.each([
    [
      'the 2013 European Standard Population and the rate beside a directly standardised rate',
      { valueTypeId: DSR, standardPopulation: 'esp-2013', countIsEstimate: '' },
      {
        standardPopulation: 'esp-2013',
        hasCount: true,
        countMeasure: 'other',
        countMeasureDetail: 'beds',
        countIsEstimate: false,
        ratePer: 1000,
        rateObject: 'other',
        rateObjectDetail: 'procedures',
      },
    ],
    [
      'an other standard population with its detail',
      { valueTypeId: DSR, hasCount: 'no' },
      {
        standardPopulation: 'other',
        standardPopulationDetail: 'England 2021',
        hasCount: false,
        ratePer: 1000,
        rateObject: 'other',
        rateObjectDetail: 'procedures',
      },
    ],
    [
      'the reference population and the count beside an indirectly standardised ratio',
      { valueTypeId: ISR },
      {
        standardPopulationDetail: 'England 2019',
        hasCount: true,
        countMeasure: 'other',
        countMeasureDetail: 'beds',
        countIsEstimate: true,
      },
    ],
    [
      'what a proportion measures when it is not what it counts',
      { valueTypeId: VALUE_TYPE_IDS.proportion, countMeasure: 'people' },
      {
        hasCount: true,
        countMeasure: 'people',
        countIsEstimate: true,
        valueSameAsCount: false,
        valueMeasure: 'other',
        valueMeasureDetail: 'patients',
      },
    ],
    [
      'what a gap measures and is between',
      { valueTypeId: VALUE_TYPE_IDS.gap, valueMeasure: 'percentage-points' },
      { valueMeasure: 'percentage-points', gapObject: 'other', gapObjectDetail: 'regions' },
    ],
    [
      'the format of a ratio',
      { valueTypeId: VALUE_TYPE_IDS.ratio, hasCount: 'no' },
      { hasCount: false, ratioFormat: 'percentage' },
    ],
    ['nothing more beside a score', { valueTypeId: VALUE_TYPE_IDS.score }, {}],
  ] as const)('writes %s, clearing what is not asked', (_, answers, attributes) => {
    expect(valueTypeAndUnitsColumns.toAttributes({ ...everyFollowUp, ...answers })).toEqual({
      valueTypeId: answers.valueTypeId,
      ...nothingMore,
      ...attributes,
    });
  });

  it.each([
    [
      'an other standard population',
      { valueTypeId: DSR, standardPopulation: 'other', standardPopulationDetail: 'England 2021' },
      { standardPopulationOther: 'England 2021', referencePopulation: null },
    ],
    [
      'a reference population',
      { valueTypeId: ISR, standardPopulationDetail: 'England 2019' },
      { standardPopulationOther: null, referencePopulation: 'England 2019' },
    ],
    [
      'the answers about the count and the rate',
      {
        valueTypeId: VALUE_TYPE_IDS.crudeRate,
        hasCount: true,
        countMeasure: 'people',
        countIsEstimate: true,
        ratePer: 100000,
        rateObject: 'people',
      },
      {
        hasCount: 'yes',
        countMeasure: 'people',
        countIsEstimate: 'yes',
        ratePer: '100000',
        rateObject: 'people',
      },
    ],
    [
      'a count that is not an estimate as an unticked box',
      { valueTypeId: VALUE_TYPE_IDS.count, countMeasure: 'people', countIsEstimate: false },
      { countIsEstimate: null },
    ],
  ] as const)('reads %s back into its own field', (_, draft, answers) => {
    expect(valueTypeAndUnitsColumns.fromDraft({ ...unansweredDraft, ...draft })).toMatchObject(
      answers,
    );
  });
});

describe('calculationColumns', () => {
  it('keeps the other organisations beside "other"', () => {
    const answers = {
      methodology: 'A method',
      calculatedBy: 'other',
      calculatedByDetail: 'ONS',
    } as const;

    expect(calculationColumns.fromDraft({ ...unansweredDraft, ...answers })).toEqual(answers);
    expect(calculationColumns.toAttributes(answers)).toEqual(answers);
  });

  it.each(['ohid', 'dhsc'] as const)(
    'clears the other organisations when %s calculated it',
    (calculatedBy) => {
      expect(
        calculationColumns.toAttributes({
          methodology: 'A method',
          calculatedBy,
          calculatedByDetail: 'Left from before',
        }),
      ).toEqual({ methodology: 'A method', calculatedBy, calculatedByDetail: null });
    },
  );
});

describe('confidenceIntervalsColumns', () => {
  it.each([
    [true, 'yes'],
    [false, 'no'],
    [null, null],
  ])('reads a modifications answer of %s as %s', (hasCiMethodModifications, answer) => {
    expect(
      confidenceIntervalsColumns.fromDraft({ ...unansweredDraft, hasCiMethodModifications })
        .hasCiMethodModifications,
    ).toBe(answer);
  });

  it.each([
    [
      'an unmodified standard method, clearing the answers it does not ask for',
      { kind: 'standard', hasCiMethodModifications: 'no' },
      { hasCiMethodModifications: false, ciMethodModificationsDetail: null, ciMethodDetail: null },
    ],
    [
      "a modified standard method with its modifications' description",
      { kind: 'standard' },
      {
        hasCiMethodModifications: true,
        ciMethodModificationsDetail: 'Adjusted for clustering',
        ciMethodDetail: null,
      },
    ],
    [
      'an other method with its detail, clearing the modifications',
      { kind: 'other' },
      {
        hasCiMethodModifications: null,
        ciMethodModificationsDetail: null,
        ciMethodDetail: 'Bootstrap intervals',
      },
    ],
    [
      'a method with nothing to describe alone, clearing every follow-up',
      { kind: 'none' },
      { hasCiMethodModifications: null, ciMethodModificationsDetail: null, ciMethodDetail: null },
    ],
  ] as const)('writes %s', (_, answers, attributes) => {
    expect(
      confidenceIntervalsColumns.toAttributes({
        ciMethodId: METHODS.standard.id,
        ...everyAnswer,
        ...answers,
      }),
    ).toEqual({ ciMethodId: METHODS.standard.id, ...attributes });
  });
});

describe('otherNotesAndCaveatsColumns', () => {
  const answered = {
    hasDataQualityIssues: 'yes',
    hasCaveats: 'yes',
    caveatsDetail: 'Survey data.',
    hasOtherNotes: 'yes',
    otherNotesDetail: 'Revised in 2024.',
  } as const;

  it('keeps every detail beside a yes', () => {
    expect(otherNotesAndCaveatsColumns.toAttributes(answered)).toEqual({
      ...answered,
      hasDataQualityIssues: true,
      hasCaveats: true,
      hasOtherNotes: true,
    });
  });

  it('clears every detail beside a no', () => {
    expect(
      otherNotesAndCaveatsColumns.toAttributes({
        ...answered,
        hasDataQualityIssues: 'no',
        hasCaveats: 'no',
        hasOtherNotes: 'no',
      }),
    ).toEqual({
      hasDataQualityIssues: false,
      hasCaveats: false,
      caveatsDetail: null,
      hasOtherNotes: false,
      otherNotesDetail: null,
    });
  });

  it('reads the stored answers back as the form gives them', () => {
    expect(
      otherNotesAndCaveatsColumns.fromDraft({
        ...unansweredDraft,
        ...answered,
        hasDataQualityIssues: true,
        hasCaveats: true,
        hasOtherNotes: true,
      }),
    ).toEqual(answered);
  });

  it.each([
    [true, 'yes'],
    [false, 'no'],
    [null, null],
  ])('reads whether there are data quality issues, %s, as %s', (hasDataQualityIssues, answer) => {
    expect(
      otherNotesAndCaveatsColumns.fromDraft({ ...unansweredDraft, hasDataQualityIssues })
        .hasDataQualityIssues,
    ).toBe(answer);
  });
});

describe('varianceAndQualityColumns', () => {
  const answered = {
    variation: 'Varies by area.',
    qualityAssurance: 'Checked against ONS figures.',
    sourceDataIssuesDetail: 'Chasing late returns.',
  } as const;

  it('reads and writes the columns of the same name', () => {
    expect(varianceAndQualityColumns.fromDraft({ ...unansweredDraft, ...answered })).toEqual(
      answered,
    );
    expect(varianceAndQualityColumns.toAttributes(answered)).toEqual(answered);
  });

  it('writes blank data quality improvement notes as none', () => {
    expect(
      varianceAndQualityColumns.toAttributes({ ...answered, sourceDataIssuesDetail: '' })
        .sourceDataIssuesDetail,
    ).toBeNull();
  });
});

describe('updateSummaryColumns', () => {
  const answered = {
    updateSummary: 'Added the 2024 data.',
    updateSummaryForReviewers: 'The 2023 values are unchanged.',
  } as const;

  it('reads and writes the columns of the same name', () => {
    expect(updateSummaryColumns.fromDraft({ ...unansweredDraft, ...answered })).toEqual(answered);
    expect(updateSummaryColumns.toAttributes(answered)).toEqual(answered);
  });

  it('writes blank information for the reviewers as none', () => {
    expect(
      updateSummaryColumns.toAttributes({ ...answered, updateSummaryForReviewers: '' })
        .updateSummaryForReviewers,
    ).toBeNull();
  });
});

describe('justificationsColumns', () => {
  const answered = {
    ciMethodJustification: 'The standard method for rates.',
    dataSourcesJustification: 'The only national source.',
    inequalitiesIncluded: 'Deprivation deciles.',
    hasExclusions: 'yes',
    exclusionsDetail: 'Areas with fewer than 5 deaths.',
    hasAutomation: 'no',
    automationDetail: 'Typed before No was chosen.',
    noAutomationReason: 'No tool reads this source.',
  } as const;

  it('keeps the details of each answer and clears those of the other', () => {
    expect(justificationsColumns.toAttributes(answered)).toEqual({
      ...answered,
      hasExclusions: true,
      hasAutomation: false,
      automationDetail: null,
    });
    expect(
      justificationsColumns.toAttributes({
        ...answered,
        hasAutomation: 'yes',
        automationDetail: 'The shared pipeline.',
      }),
    ).toMatchObject({
      hasAutomation: true,
      automationDetail: 'The shared pipeline.',
      noAutomationReason: null,
    });
  });

  it('reads the stored answers back as the form gives them', () => {
    expect(
      justificationsColumns.fromDraft({
        ...unansweredDraft,
        ...answered,
        hasExclusions: true,
        hasAutomation: false,
        automationDetail: null,
      }),
    ).toEqual({ ...answered, automationDetail: null });
  });
});

describe('otherCommentsColumns', () => {
  const answered = {
    sponsorsAndStakeholders: 'The national screening committee.',
    hasReviewerComments: 'yes',
    reviewerCommentsDetail: 'Replaces indicator 108.',
  } as const;

  it('keeps the comments beside a yes', () => {
    expect(otherCommentsColumns.toAttributes(answered)).toEqual({
      ...answered,
      hasReviewerComments: true,
    });
  });

  it('clears the comments beside a no', () => {
    expect(otherCommentsColumns.toAttributes({ ...answered, hasReviewerComments: 'no' })).toEqual({
      ...answered,
      hasReviewerComments: false,
      reviewerCommentsDetail: null,
    });
  });

  it('writes blank sponsors and stakeholders as none', () => {
    expect(
      otherCommentsColumns.toAttributes({ ...answered, sponsorsAndStakeholders: '' })
        .sponsorsAndStakeholders,
    ).toBeNull();
  });

  it('reads the stored answers back as the form gives them', () => {
    expect(
      otherCommentsColumns.fromDraft({
        ...unansweredDraft,
        ...answered,
        hasReviewerComments: true,
      }),
    ).toEqual(answered);
  });
});

describe('sexGenderAndEthnicityColumns', () => {
  it('reads unanswered demographics and their lists as none', () => {
    expect(sexGenderAndEthnicityColumns.fromDraft(unansweredDraft)).toEqual({
      demographics: [],
      sexes: [],
      genders: [],
      ethnicGroups: [],
    });
  });

  it('writes the list of each demographic collected, and clears the others', () => {
    expect(
      sexGenderAndEthnicityColumns.toAttributes({
        demographics: ['gender', 'ethnicity'],
        sexes: ['females', 'males'],
        genders: ['non-binary'],
        ethnicGroups: ['mixed', 'white'],
      }),
    ).toEqual({
      demographics: ['gender', 'ethnicity'],
      sexes: null,
      genders: ['non-binary'],
      ethnicGroups: ['mixed', 'white'],
    });
  });
});

describe('publishingDateColumns', () => {
  const notFastTracked = { fastTracked: null, fastTrackReason: null };

  it.each([
    ['in BST', '2027-09-14T08:30:00.000Z', { ...publishingDate, ...notFastTracked }],
    [
      'in GMT, as the clock showed it',
      '2027-01-04T15:05:00.000Z',
      {
        publishingDateDay: '4',
        publishingDateMonth: '1',
        publishingDateYear: '2027',
        ...notFastTracked,
        publishingTimeHour: '15',
        publishingTimeMinute: '05',
      },
    ],
  ])('reads a scheduled publication %s as its UK date and time', (_, instant, answers) => {
    const draft = { ...unansweredDraft, scheduledPublishAt: new Date(instant) };

    expect(publishingDateColumns.fromDraft(draft)).toEqual(answers);
  });

  it('reads an unscheduled publication as unanswered', () => {
    expect(Object.values(publishingDateColumns.fromDraft(unansweredDraft))).toEqual(
      Array(7).fill(null),
    );
  });

  it('reads a draft with a fast-track reason as fast-tracked', () => {
    const draft = { ...unansweredDraft, fastTrackReason: 'For a ministerial briefing.' };

    expect(publishingDateColumns.fromDraft(draft)).toMatchObject({
      fastTracked: 'yes',
      fastTrackReason: 'For a ministerial briefing.',
    });
  });

  it('writes the instant the answers name', () => {
    const scheduledPublishAt = new Date('2027-09-14T08:30:00.000Z');

    expect(publishingDateColumns.toAttributes({ ...publishingDate, scheduledPublishAt })).toEqual({
      scheduledPublishAt,
      fastTrackReason: null,
    });
  });

  it('writes the reason of a fast-tracked indicator', () => {
    const scheduledPublishAt = new Date('2027-09-14T08:30:00.000Z');

    expect(
      publishingDateColumns.toAttributes({
        ...publishingDate,
        fastTracked: 'yes',
        fastTrackReason: 'For a ministerial briefing.',
        scheduledPublishAt,
      }),
    ).toEqual({ scheduledPublishAt, fastTrackReason: 'For a ministerial briefing.' });
  });

  it('clears a reason left in the form when the box is not ticked', () => {
    const scheduledPublishAt = new Date('2027-09-14T08:30:00.000Z');

    expect(
      publishingDateColumns.toAttributes({
        ...publishingDate,
        fastTrackReason: 'Typed, then unticked.',
        scheduledPublishAt,
      }),
    ).toEqual({ scheduledPublishAt, fastTrackReason: null });
  });
});

it.each([
  ['2020-01-01', '2020-01-01'],
  ['', null],
] as const)('saves and clears the publication start date %s', (publishedFrom, stored) => {
  expect(
    periodTypeColumns.toAttributes({
      periodType: 'months',
      yearType: '',
      yearEndDay: '',
      yearEndMonth: '',
      publishedFrom,
    }),
  ).toMatchObject({ publishedFrom: stored });
  expect(periodTypeColumns.fromDraft({ ...unansweredDraft, publishedFrom: stored })).toMatchObject({
    publishedFrom: stored,
  });
});
