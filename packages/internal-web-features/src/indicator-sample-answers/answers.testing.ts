import type { SampleAnswerOptions } from './answers.ts';

const option = (id: string, name: string) => ({ id, name });

/** The choices the sample answers need, each with an id the tests can look for. */
export const sampleAnswerOptions: SampleAnswerOptions = {
  valueTypesAndUnits: {
    valueTypes: [
      option('019a0000-0000-7000-8000-000000000001', 'Crude rate'),
      option('019a0000-0000-7000-8000-000000000002', 'Count'),
    ],
  },
  ciMethods: [
    {
      id: '019a0000-0000-7000-8000-000000000005',
      name: "Byar's method",
      kind: 'standard',
    },
  ],
  dataProviders: [{ ...option('019a0000-0000-7000-8000-000000000006', 'ONS'), sources: [] }],
  tags: {
    topics: [option('019a0000-0000-7000-8000-000000000007', 'Smoking')],
    subtopics: [
      {
        ...option('019a0000-0000-7000-8000-000000000009', 'Smoking and vaping'),
        topicId: '019a0000-0000-7000-8000-000000000007',
      },
    ],
    indicatorTypes: [option('019a0000-0000-7000-8000-000000000008', 'Outcome')],
    frameworks: [],
    lifeStages: [],
    riskFactors: [],
  },
};
