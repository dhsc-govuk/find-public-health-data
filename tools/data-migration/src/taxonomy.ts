import { z } from '@fphd/config';
import {
  type IndicatorTopicFile,
  parseIndicatorTopicFile,
} from '@fphd/db-operations/data-migration-contract';

const indicatorSchema = z.object({
  fingertipsId: z.number().int().positive(),
  status: z.string(),
  measureType: z.string().nullable(),
  programmes: z.array(z.string()),
  lifeStage: z.string().nullable(),
  placements: z.array(z.object({ topic: z.string(), subtopic: z.string() })),
});

const sourceSchema = z.object({
  indicators: z.array(indicatorSchema),
  overrides: z
    .array(indicatorSchema.extend({ reason: z.string().min(1), reviewRequired: z.boolean() }))
    .default([]),
});

interface Topic {
  id: string;
  title: string;
}
interface Subtopic {
  id: string;
  topicId: string;
  title: string;
}
interface Classification {
  id: string;
  dimension: string;
  name: string;
}

/** The workbook's topic names that the service's topic list has renamed since. */
const TOPIC_NAMES: Readonly<Record<string, string>> = {
  'Heart and kidney disease': 'Heart, kidney and cardiovascular-related diseases',
};

/**
 * The workbook's subtopics, as "Topic > Subtopic", that the service's lists have renamed,
 * merged into another subtopic or removed since. A subtopic mapped to null is placed at topic
 * level, because the service's topic has no subtopics. Any other subtopic keeps its name.
 */
const SUBTOPIC_NAMES: Readonly<Record<string, string | null>> = {
  'Mortality and life expectancy > Life expectancy and healthy life expectancy': 'Life expectancy',
  'Mortality and life expectancy > All-cause and winter mortality': 'All-cause mortality',
  'Cancer > Cervical cancer': 'Other cancers',
  'Cancer > Lung cancer': 'Other cancers',
  "Mental health and wellbeing > Adult's common mental health conditions":
    'Adult common mental health conditions',
  "Mental health and wellbeing > Adult's severe mental illness": 'Adult severe mental illness',
  'Mental health and wellbeing > Wellbeing': 'Mental wellbeing',
  'Liver disease > Non-alcoholic fatty liver disease': 'All liver disease',
  'Muscles, bones and joints > Living with MSK conditions': null,
  'Muscles, bones and joints > Arthritis and joint problems': null,
  'Muscles, bones and joints > Back pain': null,
  'Muscles, bones and joints > Osteoporosis and fractures': null,
  'Stopping the spread of infection > Healthcare-associated infections':
    'Other infections and antibiotic use',
  'Stopping the spread of infection > Antibiotic use and resistance':
    'Other infections and antibiotic use',
  'Stopping the spread of infection > Infection prevention and control':
    'Other infections and antibiotic use',
  'Stopping the spread of infection > Other infections': 'Other infections and antibiotic use',
  'Fairness in health and vulnerable groups > Disability, long-term conditions and mental health':
    'Disability and long-term conditions',
};

/**
 * The workbook's tags, as "dimension: name", that the service's lists have renamed or dropped
 * since. A tag mapped to null is dropped, because the service offers nothing like it: only the
 * Public Health Outcomes Framework is among the frameworks the service offers.
 */
const TAG_NAMES: Readonly<Record<string, string | null>> = {
  'indicator_type: Screening': 'Screening or testing',
  'framework: Public Health Outcomes Framework': 'Public Health Outcomes Framework (PHOF)',
  'framework: Quality and Outcomes Framework': null,
  'framework: National Child Measurement Programme': null,
  'framework: NHS Health Check': null,
  'framework: National Immunisation Programme': null,
  'framework: NHS Screening Programme': null,
  'framework: Stop smoking services': null,
  'framework: Healthy Child Programme': null,
  'framework: Child poverty strategy': null,
  'framework: TB Action Plan': null,
  'framework: Marmot indicators': null,
  'framework: MSF respiratory (suggested)': null,
  'framework: MSF dementia and frailty (suggested)': null,
  'framework: MSF palliative and end of life care (suggested)': null,
  'framework: MSF sepsis (suggested)': null,
  'framework: MSF cardiovascular (suggested)': null,
  'life_stage: Children': 'Children (0 to 15 years old)',
  'life_stage: Young people': 'Young people (16 to 24 years old)',
  'life_stage: Working-age adults': 'Working-age adults (16 to 64 years old)',
  'life_stage: Older people': 'Older people (65 years old and over)',
};

/** The service's name for a workbook name, null for one it drops, or the name unchanged. */
function renamed(names: Readonly<Record<string, string | null>>, key: string, name: string) {
  return Object.hasOwn(names, key) ? (names[key] ?? null) : name;
}

/**
 * Translates explicit workbook placements onto the service's topics, subtopics and tags, through
 * the name maps above; names and profiles never supply inferred links. A placement under a topic
 * that has subtopics must name one of them.
 */
export function taxonomyRelationships(
  value: unknown,
  topics: readonly Topic[],
  subtopics: readonly Subtopic[],
  classifications: readonly Classification[],
  selection?: readonly number[],
): IndicatorTopicFile {
  const source = sourceSchema.parse(value);
  // TODO: Confirm indicator 276's provisional placement in taxonomy-v2.json before launch.
  const indicators = [...source.indicators, ...source.overrides];
  const sourceById = new Map(indicators.map((indicator) => [indicator.fingertipsId, indicator]));
  if (sourceById.size !== indicators.length)
    throw new Error('Taxonomy contains duplicate indicator ids');
  const selected = selection ?? indicators.map(({ fingertipsId }) => fingertipsId);
  if (new Set(selected).size !== selected.length)
    throw new Error('Taxonomy selection contains duplicate indicator ids');
  const missing = selected.filter((id) => !sourceById.has(id));
  if (missing.length)
    throw new Error(`Indicators absent from the in-scope taxonomy: ${missing.join(', ')}`);
  const topicByTitle = new Map(topics.map((topic) => [topic.title, topic.id]));
  const subtopicByTitle = new Map(
    subtopics.map((subtopic) => [`${subtopic.topicId}:${subtopic.title}`, subtopic.id]),
  );
  const topicsWithSubtopics = new Set(subtopics.map(({ topicId }) => topicId));
  const classificationByName = new Map(
    classifications.map((classification) => [
      `${classification.dimension}:${classification.name}`,
      classification.id,
    ]),
  );
  const file: IndicatorTopicFile = {
    indicators: [...selected].sort((a, b) => a - b),
    areaContextIndicators: [],
    indicatorTopics: [],
    indicatorSubtopics: [],
    indicatorClassifications: [],
    indicatorDataUpdatedAt: {},
  };
  for (const fingertipsId of file.indicators) {
    const indicator = sourceById.get(fingertipsId);
    if (!indicator) throw new Error(`Unknown taxonomy indicator: ${fingertipsId}`);
    const context = indicator.status.startsWith('Not tagged: area context');
    if (context) {
      if (
        indicator.placements.length ||
        indicator.measureType ||
        indicator.programmes.length ||
        indicator.lifeStage
      )
        throw new Error(`Area-context indicator has assignments: ${fingertipsId}`);
      file.areaContextIndicators.push(fingertipsId);
      continue;
    }
    const topicIds = new Set<string>();
    const subtopicIds = new Map<string, string>();
    for (const placement of indicator.placements) {
      const title = TOPIC_NAMES[placement.topic] ?? placement.topic;
      const topicId = topicByTitle.get(title);
      if (!topicId) throw new Error(`Unknown taxonomy topic: ${placement.topic}`);
      topicIds.add(topicId);
      const subtopic = renamed(
        SUBTOPIC_NAMES,
        `${placement.topic} > ${placement.subtopic}`,
        placement.subtopic,
      );
      const atTopicLevel = subtopic === null || subtopic === placement.topic;
      const subtopicId = atTopicLevel ? undefined : subtopicByTitle.get(`${topicId}:${subtopic}`);
      if (subtopicId) subtopicIds.set(subtopicId, topicId);
      else if (!atTopicLevel)
        throw new Error(`Unknown taxonomy subtopic: ${placement.topic} > ${placement.subtopic}`);
      else if (topicsWithSubtopics.has(topicId))
        throw new Error(`Taxonomy topic needs a subtopic: ${fingertipsId}: ${title}`);
    }
    for (const topicId of topicIds) file.indicatorTopics.push({ fingertipsId, topicId });
    for (const [subtopicId, topicId] of subtopicIds)
      file.indicatorSubtopics.push({ fingertipsId, topicId, subtopicId });
    const tags = [
      ...(indicator.measureType ? [['indicator_type', indicator.measureType]] : []),
      ...indicator.programmes.map((name) => ['framework', name]),
      ...(indicator.lifeStage
        ? indicator.lifeStage.split('; ').map((name) => ['life_stage', name])
        : []),
    ];
    const used = new Set<string>();
    for (const [dimension, name] of tags) {
      const serviceName = renamed(TAG_NAMES, `${dimension}: ${name}`, name ?? '');
      if (serviceName === null) continue;
      const classificationId = classificationByName.get(`${dimension}:${serviceName}`);
      if (!classificationId) throw new Error(`Unknown taxonomy tag: ${dimension}: ${name}`);
      if (used.has(classificationId))
        throw new Error(`Duplicate taxonomy tag: ${fingertipsId}: ${name}`);
      used.add(classificationId);
      file.indicatorClassifications.push({ fingertipsId, classificationId });
    }
  }
  return parseIndicatorTopicFile(file);
}
