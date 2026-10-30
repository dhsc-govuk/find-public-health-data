import type { SampleAnswerOptions } from './answers.ts';

const option = (id: string, name: string) => ({ id, name });

/** The choices the sample answers need, each with an id the tests can look for. */
export const sampleAnswerOptions: SampleAnswerOptions = {
  valueTypesAndUnits: {
    valueTypes: [
      option('019a0000-0000-7000-8000-000000000001', 'Crude rate'),
      option('019a0000-0000-7000-8000-000000000002', 'Count'),
    ],
    units: [
      option('019a0000-0000-7000-8000-000000000003', 'per 1,000'),
      option('019a0000-0000-7000-8000-000000000004', 'per 100'),
    ],
  },
  ciMethods: [
    {
      id: '019a0000-0000-7000-8000-000000000005',
      name: "Byar's method",
      description: null,
      kind: 'standard',
    },
  ],
  dataProviders: [{ ...option('019a0000-0000-7000-8000-000000000006', 'ONS'), sources: [] }],
  tags: {
    topics: [option('019a0000-0000-7000-8000-000000000007', 'Smoking')],
    subtopics: [],
    indicatorTypes: [option('019a0000-0000-7000-8000-000000000008', 'Outcome')],
    lifeStages: [],
    frameworks: [],
  },
};
