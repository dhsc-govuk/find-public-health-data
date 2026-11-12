import { UNIT_IDS, VALUE_TYPE_IDS } from '@fphd/utils/value-type-and-unit';
import { describe, expect, it } from 'vitest';
import {
  benchmarkingColumns,
  calculationColumns,
  confidenceIntervalsColumns,
  copyrightAndDataReuseColumns,
  dataQualityColumns,
  definitionAndRationaleColumns,
  justificationsColumns,
  otherCommentsColumns,
  otherNotesAndCaveatsColumns,
  periodTypeColumns,
  polarityColumns,
  publishingDateColumns,
  updateFrequencyColumns,
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

describe('dataQualityColumns', () => {
  it.each([
    [true, 'yes'],
    [false, 'no'],
    [null, null],
  ])('reads whether there are data quality issues, %s, as %s', (hasDataQualityIssues, answer) => {
    expect(dataQualityColumns.fromDraft({ ...unansweredDraft, hasDataQualityIssues })).toEqual({
      hasDataQualityIssues: answer,
    });
  });

  it.each([
    ['yes', true],
    ['no', false],
  ] as const)('writes %s as %s', (hasDataQualityIssues, answer) => {
    expect(dataQualityColumns.toAttributes({ hasDataQualityIssues })).toEqual({
      hasDataQualityIssues: answer,
    });
  });
});

describe('updateFrequencyColumns', () => {
  it('reads a frequency that has no reason, leaving both reasons empty', () => {
    expect(
      updateFrequencyColumns.fromDraft({ ...unansweredDraft, updateFrequency: 'annually' }),
    ).toEqual({
      updateFrequency: 'annually',
      noFixedFrequencyReason: null,
      noLongerUpdatedReason: null,
    });
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
      ).toEqual({ updateFrequency, [shown]: 'The survey has ended.', [empty]: null });
    },
  );

  it.each([
    ['no-fixed-frequency', 'Published when the survey runs.'],
    ['no-longer-updated', 'The survey has ended.'],
    ['annually', null],
  ] as const)('keeps the reason typed under %s alone', (updateFrequency, updateFrequencyReason) => {
    expect(
      updateFrequencyColumns.toAttributes({
        updateFrequency,
        noFixedFrequencyReason: 'Published when the survey runs.',
        noLongerUpdatedReason: 'The survey has ended.',
      }),
    ).toEqual({ updateFrequency, updateFrequencyReason });
  });
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
    ).toEqual({ periodType: years, yearType: specified, yearEndDay: '31', yearEndMonth: '7' });
  });

  it('writes the year end of a year ending on a specified date', () => {
    expect(
      periodTypeColumns.toAttributes({
        periodType: years,
        yearType: specified,
        yearEndDay: '31',
        yearEndMonth: '07',
      }),
    ).toEqual({ periodType: years, yearType: specified, yearEndDay: 31, yearEndMonth: 7 });
  });

  it('clears a year end the year type does not ask for', () => {
    expect(
      periodTypeColumns.toAttributes({
        periodType: 'quarters',
        yearType: 'financial',
        yearEndDay: '31',
        yearEndMonth: '7',
      }),
    ).toEqual({
      periodType: 'quarters',
      yearType: 'financial',
      yearEndDay: null,
      yearEndMonth: null,
    });
  });

  it('clears the year type and year end of months', () => {
    expect(
      periodTypeColumns.toAttributes({
        periodType: 'months',
        yearType: specified,
        yearEndDay: '31',
        yearEndMonth: '7',
      }),
    ).toEqual({
      periodType: 'months',
      yearType: null,
      yearEndDay: null,
      yearEndMonth: null,
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
    unitDetail: 'people',
  } as const;

  it.each([
    [
      'the 2013 European Standard Population alone beside a directly standardised rate',
      {
        valueTypeId: DSR,
        standardPopulation: 'esp-2013',
        unitId: '01a0d8a5-3ca2-7315-bfca-96daa0c93ee9',
      },
      { standardPopulation: 'esp-2013', standardPopulationDetail: null, unitDetail: null },
    ],
    [
      'an other standard population with its detail',
      { valueTypeId: DSR, unitId: '01a0d8a5-3ca2-7315-bfca-96daa0c93ee9' },
      { standardPopulation: 'other', standardPopulationDetail: 'England 2021', unitDetail: null },
    ],
    [
      'the reference population beside an indirectly standardised value type',
      { valueTypeId: ISR, unitId: '01a0d8a5-3ca2-7315-bfca-96d787920e40' },
      { standardPopulation: null, standardPopulationDetail: 'England 2019', unitDetail: null },
    ],
    [
      'no population beside any other value type, and an other unit with its name',
      { valueTypeId: '01a0d8a5-3ca2-7315-bfca-96c7324d4347', unitId: UNIT_IDS.other },
      { standardPopulation: null, standardPopulationDetail: null, unitDetail: 'people' },
    ],
  ] as const)('writes %s, clearing what is not asked', (_, answers, attributes) => {
    expect(valueTypeAndUnitsColumns.toAttributes({ ...everyFollowUp, ...answers })).toEqual({
      valueTypeId: answers.valueTypeId,
      unitId: answers.unitId,
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
    disclosureControl: 'yes',
    disclosureControlDetail: 'Counts under 5 are suppressed.',
    hasRounding: 'yes',
    roundingDetail: 'Rounded to the nearest 5.',
    hasCaveats: 'yes',
    caveatsDetail: 'Survey data.',
    hasOtherNotes: 'yes',
    otherNotesDetail: 'Revised in 2024.',
  } as const;

  it('keeps every detail beside a yes', () => {
    expect(otherNotesAndCaveatsColumns.toAttributes(answered)).toEqual({
      ...answered,
      hasRounding: true,
      hasCaveats: true,
      hasOtherNotes: true,
    });
  });

  it.each(['no', 'not-applicable'] as const)(
    'clears every detail beside a no, and disclosure control that is %s',
    (disclosureControl) => {
      expect(
        otherNotesAndCaveatsColumns.toAttributes({
          ...answered,
          disclosureControl,
          hasRounding: 'no',
          hasCaveats: 'no',
          hasOtherNotes: 'no',
        }),
      ).toEqual({
        disclosureControl,
        disclosureControlDetail: null,
        hasRounding: false,
        roundingDetail: null,
        hasCaveats: false,
        caveatsDetail: null,
        hasOtherNotes: false,
        otherNotesDetail: null,
      });
    },
  );

  it('reads the stored answers back as the form gives them', () => {
    expect(
      otherNotesAndCaveatsColumns.fromDraft({
        ...unansweredDraft,
        ...answered,
        hasRounding: true,
        hasCaveats: true,
        hasOtherNotes: true,
      }),
    ).toEqual(answered);
  });

  it.each([
    [true, 'yes'],
    [false, 'no'],
    [null, null],
  ])('reads a stored %s as %s', (hasRounding, answer) => {
    expect(
      otherNotesAndCaveatsColumns.fromDraft({ ...unansweredDraft, hasRounding }).hasRounding,
    ).toBe(answer);
  });
});

// yesNoDetailColumns, shown through a section built on it alone.
describe('copyrightAndDataReuseColumns', () => {
  const answered = {
    hasCustomCopyright: 'yes',
    customCopyrightDetail: 'NHS England.',
    hasCustomDataReuse: 'no',
    customDataReuseDetail: 'Typed before No was chosen.',
  } as const;

  it('writes a yes as true beside its details, and a no as false without them', () => {
    expect(copyrightAndDataReuseColumns.toAttributes(answered)).toEqual({
      hasCustomCopyright: true,
      customCopyrightDetail: 'NHS England.',
      hasCustomDataReuse: false,
      customDataReuseDetail: null,
    });
  });

  it.each([
    [true, 'yes'],
    [false, 'no'],
    [null, null],
  ])('reads a stored %s as %s, beside its details as they are', (hasCustomCopyright, answer) => {
    expect(
      copyrightAndDataReuseColumns.fromDraft({
        ...unansweredDraft,
        hasCustomCopyright,
        customCopyrightDetail: 'NHS England.',
      }),
    ).toEqual({
      hasCustomCopyright: answer,
      customCopyrightDetail: 'NHS England.',
      hasCustomDataReuse: null,
      customDataReuseDetail: null,
    });
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

describe('benchmarkingColumns', () => {
  const goal = {
    hasGoalBenchmark: 'yes',
    goalLowerValue: '2,400',
    goalUpperValue: '3250.5',
    goalPolarity: 'higher-is-better',
    goalPolicyDetail: 'The national detection rate ambition.',
  } as const;

  const noGoal = {
    hasGoalBenchmark: false,
    goalLowerValue: null,
    goalUpperValue: null,
    goalPolarity: null,
    goalPolicyDetail: null,
  };

  it('writes a goal with its values as numbers', () => {
    expect(benchmarkingColumns.toAttributes(goal)).toEqual({
      hasGoalBenchmark: true,
      goalLowerValue: 2400,
      goalUpperValue: 3250.5,
      goalPolarity: 'higher-is-better',
      goalPolicyDetail: 'The national detection rate ambition.',
    });
  });

  it('writes a single goal value and a blank detail as none', () => {
    expect(
      benchmarkingColumns.toAttributes({ ...goal, goalUpperValue: '', goalPolicyDetail: '' }),
    ).toMatchObject({ goalUpperValue: null, goalPolicyDetail: null });
  });

  it('writes no goal and clears whatever the form sent beside it', () => {
    expect(benchmarkingColumns.toAttributes({ ...goal, hasGoalBenchmark: 'no' })).toEqual(noGoal);
  });

  it('reads a goal back as the form shows it', () => {
    expect(
      benchmarkingColumns.fromDraft({
        ...unansweredDraft,
        hasGoalBenchmark: true,
        goalLowerValue: 2400,
        goalUpperValue: 1e21,
        goalPolarity: 'lower-is-better',
        goalPolicyDetail: null,
      }),
    ).toEqual({
      hasGoalBenchmark: 'yes',
      goalLowerValue: '2400',
      goalUpperValue: '1000000000000000000000',
      goalPolarity: 'lower-is-better',
      goalPolicyDetail: null,
    });
  });

  it.each([
    [false, 'no'],
    [null, null],
  ])('reads a stored %s as %s', (hasGoalBenchmark, answer) => {
    expect(benchmarkingColumns.fromDraft({ ...unansweredDraft, hasGoalBenchmark })).toEqual({
      hasGoalBenchmark: answer,
      goalLowerValue: null,
      goalUpperValue: null,
      goalPolarity: null,
      goalPolicyDetail: null,
    });
  });
});

describe('publishingDateColumns', () => {
  it.each([
    ['in BST', '2027-09-14T08:30:00.000Z', publishingDate],
    [
      'in GMT, as the clock showed it',
      '2027-01-04T15:05:00.000Z',
      {
        publishingDateDay: '4',
        publishingDateMonth: '1',
        publishingDateYear: '2027',
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
      Array(5).fill(null),
    );
  });

  it('writes the instant the answers name', () => {
    const scheduledPublishAt = new Date('2027-09-14T08:30:00.000Z');

    expect(publishingDateColumns.toAttributes({ ...publishingDate, scheduledPublishAt })).toEqual({
      scheduledPublishAt,
    });
  });
});
