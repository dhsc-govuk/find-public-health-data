import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { taxonomyRelationships } from './taxonomy.ts';

const data = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../packages/db-operations/data/${name}.json`, import.meta.url),
      'utf8',
    ),
  );
const source = data('taxonomy-v2');
const topics = data('topics');
const subtopics = data('subtopics');
const classifications = data('classifications');
const build = (input = source, selection?: number[]) =>
  taxonomyRelationships(input, topics, subtopics, classifications, selection);

const idOfTopic = (title: string) =>
  topics.find((topic: { title: string }) => topic.title === title).id;
const idOfSubtopic = (topic: string, title: string) =>
  subtopics.find(
    (subtopic: { topicId: string; title: string }) =>
      subtopic.topicId === idOfTopic(topic) && subtopic.title === title,
  ).id;
const nameOfClassification = (id: string) =>
  classifications.find((classification: { id: string }) => classification.id === id).name;

describe('the V2 workbook assignments', () => {
  it('reproduces the committed relationships without inferring memberships', () => {
    const file = build();
    expect(file).toEqual(data('published-indicator-topics'));
    expect(file.indicators).toHaveLength(881);
    expect(file.areaContextIndicators).toHaveLength(15);
    expect(topics).toHaveLength(19);
    expect(subtopics).toHaveLength(86);
    expect(classifications).toHaveLength(24);
  });

  it('keeps two mortality subtopics for indicator 108 under one topic', () => {
    const file = build(source, [108]);
    expect(file.indicatorTopics).toEqual([
      { fingertipsId: 108, topicId: idOfTopic('Mortality and life expectancy') },
    ]);
    expect(file.indicatorSubtopics).toHaveLength(2);
  });

  it('leaves population indicators explicitly untagged as area context', () => {
    expect(build(source, [92708])).toMatchObject({
      indicators: [92708],
      areaContextIndicators: [92708],
      indicatorTopics: [],
      indicatorSubtopics: [],
      indicatorClassifications: [],
    });
  });

  it('does not manufacture a placement for an indicator excluded from the workbook', () => {
    expect(() => build(source, [359])).toThrow('Indicators absent from the in-scope taxonomy: 359');
  });

  it('keeps the explicitly selected cancer dataset under its provisional reviewed placement', () => {
    const file = build(source, [276]);
    const topicId = idOfTopic('Cancer');
    const subtopicId = idOfSubtopic('Cancer', 'All cancers');
    expect(file).toMatchObject({
      indicators: [276],
      areaContextIndicators: [],
      indicatorTopics: [{ fingertipsId: 276, topicId }],
      indicatorSubtopics: [{ fingertipsId: 276, topicId, subtopicId }],
      indicatorClassifications: [],
    });
    expect(build().indicators).toContain(276);
    expect(build().indicatorTopics).toContainEqual(file.indicatorTopics[0]);
  });

  it('rejects an override that duplicates a workbook indicator', () => {
    const changed = structuredClone(source);
    changed.overrides[0].fingertipsId = 108;
    expect(() => build(changed)).toThrow('Taxonomy contains duplicate indicator ids');
  });

  it('rejects an unknown subtopic', () => {
    const changed = structuredClone(source);
    const indicator = changed.indicators.find(
      ({ fingertipsId }: { fingertipsId: number }) => fingertipsId === 108,
    );
    indicator.placements[1].subtopic = 'Unreviewed guess';
    expect(() => build(changed, [108])).toThrow('Unknown taxonomy subtopic');
  });

  it('rejects a topic-level placement under a topic that has subtopics', () => {
    const changed = structuredClone(source);
    const indicator = changed.indicators.find(
      ({ fingertipsId }: { fingertipsId: number }) => fingertipsId === 108,
    );
    indicator.placements[1].subtopic = 'Mortality and life expectancy';
    expect(() => build(changed, [108])).toThrow(
      'Taxonomy topic needs a subtopic: 108: Mortality and life expectancy',
    );
  });

  it('gives every placement under a topic with subtopics one of them', () => {
    const file = build();
    const withSubtopics = new Set(subtopics.map(({ topicId }: { topicId: string }) => topicId));
    const placed = new Set(
      file.indicatorSubtopics.map(({ fingertipsId, topicId }) => `${fingertipsId}:${topicId}`),
    );
    expect(
      file.indicatorTopics.filter(
        ({ fingertipsId, topicId }) =>
          withSubtopics.has(topicId) && !placed.has(`${fingertipsId}:${topicId}`),
      ),
    ).toEqual([]);
  });

  it('places the renamed heart topic and merges two cancers into Other cancers once', () => {
    const changed = structuredClone(source);
    const indicator = changed.indicators.find(
      ({ fingertipsId }: { fingertipsId: number }) => fingertipsId === 108,
    );
    indicator.placements = [
      { topic: 'Cancer', subtopic: 'Cervical cancer' },
      { topic: 'Cancer', subtopic: 'Lung cancer' },
      { topic: 'Heart and kidney disease', subtopic: 'Stroke' },
    ];
    const file = build(changed, [108]);
    const heart = 'Heart, kidney and cardiovascular-related diseases';
    expect(file.indicatorTopics.map(({ topicId }) => topicId)).toEqual([
      idOfTopic('Cancer'),
      idOfTopic(heart),
    ]);
    expect(file.indicatorSubtopics.map(({ subtopicId }) => subtopicId)).toEqual([
      idOfSubtopic('Cancer', 'Other cancers'),
      idOfSubtopic(heart, 'Stroke'),
    ]);
  });

  it('keeps dental, sensory and musculoskeletal indicators at topic level', () => {
    const levelTopics = [
      'Dental and oral health',
      'Sight and hearing',
      'Muscles, bones and joints',
    ];
    const ids = source.indicators
      .filter((indicator: { placements: { topic: string }[] }) =>
        indicator.placements.some(({ topic }) => levelTopics.includes(topic)),
      )
      .map(({ fingertipsId }: { fingertipsId: number }) => fingertipsId);
    const file = build(source, ids);
    const topicIds = new Set(levelTopics.map(idOfTopic));
    expect(
      file.indicatorTopics.filter(({ topicId }) => topicIds.has(topicId)).length,
    ).toBeGreaterThan(0);
    expect(file.indicatorSubtopics.filter(({ topicId }) => topicIds.has(topicId))).toEqual([]);
  });

  it('maps the measure types, frameworks and life stages onto the service names', () => {
    const names = build().indicatorClassifications.map(({ classificationId }) =>
      nameOfClassification(classificationId),
    );
    expect(names).toContain('Screening or testing');
    expect(names).toContain('Public Health Outcomes Framework (PHOF)');
    expect(names).toContain('Children (0 to 15 years old)');
    expect(names).not.toContain('Quality and Outcomes Framework');
  });

  it('rejects a tag the maps do not name', () => {
    const changed = structuredClone(source);
    const indicator = changed.indicators.find(
      ({ fingertipsId }: { fingertipsId: number }) => fingertipsId === 108,
    );
    indicator.programmes = ['Unreviewed programme'];
    expect(() => build(changed, [108])).toThrow(
      'Unknown taxonomy tag: framework: Unreviewed programme',
    );
  });
});
