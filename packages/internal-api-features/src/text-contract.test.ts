import { describe, expect, it } from 'vitest';

import { agesSection } from './indicator-ages-contract.ts';
import { benchmarkingSection } from './indicator-benchmarking-contract.ts';
import { calculationSection } from './indicator-calculation-contract.ts';
import { confidenceIntervalsSection } from './indicator-confidence-intervals-contract.ts';
import { copyrightAndDataReuseSection } from './indicator-copyright-and-data-reuse-contract.ts';
import { definitionAndRationaleSection } from './indicator-definition-and-rationale-contract.ts';
import { justificationsSection } from './indicator-justifications-contract.ts';
import {
  denominatorSection,
  numeratorSection,
} from './indicator-numerator-denominator-contract.ts';
import { otherCommentsSection } from './indicator-other-comments-contract.ts';
import { otherNotesAndCaveatsSection } from './indicator-other-notes-and-caveats-contract.ts';
import type { IndicatorSection } from './indicator-section-contract.ts';
import { updateFrequencySection } from './indicator-update-frequency-contract.ts';
import { valueTypeAndUnitsSection } from './indicator-value-type-and-units-contract.ts';
import { varianceAndQualitySection } from './indicator-variance-and-quality-contract.ts';
import { sectionFieldErrors } from './testing.ts';
import { longText, shortText } from './text-contract.ts';

function messages(result: { error?: { issues: { message: string }[] } }): string[] | undefined {
  return result.error?.issues.map(({ message }) => message);
}

describe('shortText', () => {
  const schema = shortText('Field');

  it('takes the text without its surrounding spaces', () => {
    expect(schema.parse('\t An answer \n')).toBe('An answer');
  });

  it.each(['', '  '])('takes %o as empty, so the field can say whether it requires one', (text) => {
    expect(schema.parse(text)).toBe('');
  });

  it('accepts 300 characters, measured once trimmed', () => {
    expect(schema.safeParse(` ${'a'.repeat(300)} `).success).toBe(true);
  });

  it('refuses 301 characters', () => {
    expect(messages(schema.safeParse('a'.repeat(301)))).toEqual([
      'Field must be 300 characters or fewer',
    ]);
  });

  it('counts an emoji as one character', () => {
    expect(schema.safeParse('😀'.repeat(300)).success).toBe(true);
    expect(messages(schema.safeParse('😀'.repeat(301)))).toEqual([
      'Field must be 300 characters or fewer',
    ]);
  });

  it.each([
    ['a tab', 'a\tb'],
    ['a newline', 'a\nb'],
    ['a carriage return', 'a\rb'],
    ['a null', 'a\u0000b'],
    ['a delete', 'a\u007fb'],
    ['a C1 control', 'a\u0085b'],
  ])('refuses %s inside the text', (_, text) => {
    expect(messages(schema.safeParse(text))).toEqual([
      'Field must not include hidden formatting characters',
    ]);
  });
});

describe('longText', () => {
  const schema = longText('Field');

  it('takes the text without its surrounding spaces and blank lines', () => {
    expect(schema.parse('\n\n  An answer\n\t')).toBe('An answer');
  });

  it.each(['', ' \r\n\t'])(
    'takes %o as empty, so the field can say whether it requires one',
    (text) => {
      expect(schema.parse(text)).toBe('');
    },
  );

  it('keeps indentation, blank lines and trailing spaces inside the text', () => {
    const markdown = 'A list:\n\n- one  \n  - nested\n\tindented';

    expect(schema.parse(markdown)).toBe(markdown);
  });

  it.each([
    ['CRLF', 'one\r\ntwo\r\nthree'],
    ['lone CR', 'one\rtwo\rthree'],
  ])('writes each %s line ending as LF', (_, text) => {
    expect(schema.parse(text)).toBe('one\ntwo\nthree');
  });

  it('accepts 10,000 characters, measured once trimmed and with LF line endings', () => {
    expect(schema.safeParse(` ${'a'.repeat(9_998)}\r\nb `).success).toBe(true);
  });

  it('refuses 10,001 characters', () => {
    expect(messages(schema.safeParse('a'.repeat(10_001)))).toEqual([
      'Field must be 10,000 characters or fewer',
    ]);
  });

  it('counts an emoji as one character', () => {
    expect(schema.safeParse('😀'.repeat(10_000)).success).toBe(true);
    expect(messages(schema.safeParse('😀'.repeat(10_001)))).toEqual([
      'Field must be 10,000 characters or fewer',
    ]);
  });

  it.each([
    ['a vertical tab', 'a\u000bb'],
    ['a form feed', 'a\u000cb'],
    ['a null', 'a\u0000b'],
    ['a delete', 'a\u007fb'],
    ['a C1 control', 'a\u0085b'],
  ])('refuses %s inside the text', (_, text) => {
    expect(messages(schema.safeParse(text))).toEqual([
      'Field must not include hidden formatting characters',
    ]);
  });
});

type Refusals = (answers: Record<string, string>) => Partial<Record<string, string>> | undefined;

/** A section's refusals of a form with `answers` typed and every other field left blank. */
function refusalsOf<Field extends string, ErrorField extends string>(
  section: IndicatorSection<Field, unknown, unknown, ErrorField, never>,
  blank: object = Object.fromEntries(section.fields.options.map((field) => [field, ''])),
): Refusals {
  return (answers) => sectionFieldErrors(section, { ...blank, ...answers });
}

const blankAges = {
  ageType: '',
  ageRanges: [],
  specificAge: '',
  specificAgeUnit: '',
  ageDetail: '',
};

// The link URL keeps a limit of its own, tested in its contract.
const sections: [string, number, Refusals, Record<string, string>][] = [
  [
    'benchmarking',
    10_000,
    refusalsOf(benchmarkingSection),
    { goalPolicyDetail: 'Detail about the policy goal' },
  ],
  [
    'calculation',
    10_000,
    refusalsOf(calculationSection),
    {
      methodology: 'Methodology',
      calculatedByDetail: 'Details of the other organisation or organisations',
    },
  ],
  [
    'confidence intervals',
    10_000,
    refusalsOf(confidenceIntervalsSection),
    {
      ciMethodModificationsDetail: 'Description of the modifications',
      ciMethodDetail: 'Details of the other confidence interval method',
    },
  ],
  [
    'copyright and data re-use',
    10_000,
    refusalsOf(copyrightAndDataReuseSection),
    {
      customCopyrightDetail: 'Details of the copyright',
      customDataReuseDetail: 'Details of the data re-use',
    },
  ],
  [
    'definition and rationale',
    10_000,
    refusalsOf(definitionAndRationaleSection),
    { definition: 'Definition', rationale: 'Rationale' },
  ],
  [
    'justifications',
    10_000,
    refusalsOf(justificationsSection),
    {
      ciMethodJustification: 'Reason for choosing the confidence interval method',
      dataSourcesJustification: 'Reason for choosing the data sources',
      inequalitiesIncluded: 'Health inequalities included',
      exclusionsDetail: 'Reason for the exclusions',
      automationDetail: 'Details of the tools used',
      noAutomationReason: 'Reasons for not using automation tools',
    },
  ],
  [
    'numerator',
    10_000,
    refusalsOf(numeratorSection, { sources: [] }),
    { definition: 'Definition of the numerator' },
  ],
  [
    'denominator',
    10_000,
    refusalsOf(denominatorSection, { sources: [] }),
    { definition: 'Definition of the denominator' },
  ],
  [
    'other comments',
    10_000,
    refusalsOf(otherCommentsSection),
    { sponsorsAndStakeholders: 'Sponsors or stakeholders', reviewerCommentsDetail: 'Comments' },
  ],
  [
    'other notes and caveats',
    10_000,
    refusalsOf(otherNotesAndCaveatsSection),
    {
      disclosureControlDetail: 'Details of the disclosure control',
      roundingDetail: 'Details of the rounding',
      caveatsDetail: 'Details of the caveats',
      otherNotesDetail: 'Details of the other notes',
    },
  ],
  [
    'update frequency',
    10_000,
    refusalsOf(updateFrequencySection),
    {
      noFixedFrequencyReason: 'Reason for having no fixed update frequency',
      noLongerUpdatedReason: 'Reason for no longer updating this indicator',
    },
  ],
  [
    'variance and quality',
    10_000,
    refusalsOf(varianceAndQualitySection),
    {
      variation: 'Variation',
      qualityAssurance: 'Quality assurance',
      sourceDataIssuesDetail: 'Data quality improvement notes',
    },
  ],
  ['ages', 300, refusalsOf(agesSection, blankAges), { ageDetail: 'Ages included' }],
  [
    'value type and units',
    300,
    refusalsOf(valueTypeAndUnitsSection),
    {
      standardPopulationOther: 'Standard or reference population',
      referencePopulation: 'Standard or reference population',
      unitDetail: 'Unit',
    },
  ],
];

describe('the section contracts', () => {
  it.each(sections)('limit the %s text to %i characters', (_, max, refusals, nouns) => {
    const fields = Object.keys(nouns);
    const limit = max.toLocaleString('en-GB');

    expect(
      refusals(Object.fromEntries(fields.map((field) => [field, 'a'.repeat(max + 1)]))),
    ).toMatchObject(
      Object.fromEntries(
        fields.map((field) => [field, `${nouns[field]} must be ${limit} characters or fewer`]),
      ),
    );
  });
});
