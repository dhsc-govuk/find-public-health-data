import { z } from '@fphd/config/zod';

import {
  type DetailedQuestion,
  type IndicatorSection,
  requireDetails,
  textSection,
  yesNoSchema,
} from './indicator-section-contract.ts';
import { longText } from './text-contract.ts';

const fields = z.enum([
  'ciMethodJustification',
  'dataSourcesJustification',
  'inequalitiesIncluded',
  'hasExclusions',
  'exclusionsDetail',
  'hasAutomation',
  'automationDetail',
  'noAutomationReason',
]);

export type JustificationsField = z.infer<typeof fields>;

export const justificationsQuestions = [
  {
    answer: 'hasExclusions',
    detail: 'exclusionsDetail',
    detailRequired: 'Enter why exclusions were made',
  },
  {
    answer: 'hasAutomation',
    detail: 'automationDetail',
    detailRequired: 'Enter details of the tools used',
  },
  {
    answer: 'hasAutomation',
    detail: 'noAutomationReason',
    detailRequired: 'Enter reasons why not',
    onAnswer: 'no',
  },
] as const satisfies readonly DetailedQuestion<JustificationsField>[];

const schema = requireDetails(
  z.object({
    ciMethodJustification: longText('Reason for choosing the confidence interval method').min(
      1,
      'Enter why the confidence interval method was chosen',
    ),
    dataSourcesJustification: longText('Reason for choosing the data sources').min(
      1,
      'Enter why the data sources were chosen',
    ),
    inequalitiesIncluded: longText('Health inequalities included').min(
      1,
      'Enter what health inequalities have been included',
    ),
    hasExclusions: yesNoSchema('Select whether there have been any exclusions'),
    exclusionsDetail: longText('Reason for the exclusions'),
    hasAutomation: yesNoSchema('Select whether internal automation tools have been used'),
    automationDetail: longText('Details of the tools used'),
    noAutomationReason: longText('Reasons for not using automation tools'),
  }),
  justificationsQuestions,
);

export type Justifications = z.infer<typeof schema>;

/** Notes for reviewers on why the indicator was built as it was. */
export const justificationsSection: IndicatorSection<JustificationsField, Justifications> =
  textSection({ key: 'justifications', fields, schema });
