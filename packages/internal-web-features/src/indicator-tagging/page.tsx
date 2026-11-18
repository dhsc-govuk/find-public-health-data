import {
  subtopicsOf,
  TAG_LIST_DETAILS,
  type TagList,
  type TagOption,
  type TagOptions,
} from '@fphd/internal-api-features/contract';
import { Button, fieldInputId, firstRadioId, Radios, Select, TextInput } from '@fphd/ui';
import { CLASSIFICATION_IDS } from '@fphd/utils/classification-dimension';
import type { ElementType, ReactNode } from 'react';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { addIntent, removeIntent } from '../list-form.ts';
import { useSelectedValue } from '../selected-value.ts';
import {
  ADD_TAG_FIELDS,
  type AddedTagList,
  type TaggingPageField,
  type TaggingPageValues,
} from './form.ts';

type FieldErrors = Partial<Record<TaggingPageField, string>>;

/** The lists with a picker of their own; topics and subtopics share the topic picker. */
type PickerList = Exclude<AddedTagList, 'topicIds' | 'subtopicIds'>;

const FRAMEWORK_QUESTION = 'Is this indicator part of a framework or programme?';
const LIFE_STAGE_QUESTION = 'Do you need to include the life stage the indicator relates to?';
const RISK_FACTOR_QUESTION = 'Does this indicator include a risk factor?';

// The order the error summary lists them in, which is the order the page asks.
const FIELDS: readonly TaggingPageField[] = [
  'topicIds',
  'addTopic',
  'subtopicIds',
  'addSubtopic',
  'indicatorTypeIds',
  'hasFramework',
  'frameworkIds',
  'addFramework',
  'phofIndicatorNumber',
  'hasLifeStage',
  'lifeStageIds',
  'addLifeStage',
  'hasRiskFactor',
  'riskFactorIds',
  'addRiskFactor',
];

/** A tag added so far, with the button that removes it from its list. */
interface AddedTag {
  name: string;
  list: TagList;
  index: number;
}

function selectOptions(options: readonly TagOption[]) {
  return [
    { label: 'Select', value: '' },
    ...options.map(({ id, name }) => ({ label: name, value: id })),
  ];
}

/** The tags added so far, each with a Remove button and named in the hidden text after it. */
function AddedTags({ added, noun }: { added: readonly AddedTag[]; noun: string }) {
  return added.length === 0 ? null : (
    <ul className="fphd-added-list">
      {added.map(({ name, list, index }) => (
        <li className="fphd-added-list__item" key={`${list}-${index}`}>
          <span>{name}</span>
          <Button
            classModifiers="secondary"
            className="govuk-!-margin-bottom-0"
            name="intent"
            value={removeIntent(index, list)}
          >
            {'Remove '}
            <span className="govuk-visually-hidden">
              {noun} {name}
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** A hidden field for each id of the list the page offers, so Continue saves it. */
function HiddenIds({ list, ids }: { list: TagList; ids: readonly string[] }) {
  return ids.map((id) => <input key={id} name={list} type="hidden" value={id} />);
}

/**
 * The topics added so far, in the order added, each shown with every subtopic chosen under it as
 * "Topic: Subtopic". The ids are those the page offers, which the form sends back.
 */
function addedTopics(
  topicIds: readonly string[],
  subtopicIds: readonly string[],
  options: TagOptions,
): AddedTag[] {
  return topicIds.flatMap((topicId, topicIndex): AddedTag[] => {
    const topic = options.topics.find(({ id }) => id === topicId);
    const subtopics = subtopicIds.flatMap((subtopicId, index) => {
      const subtopic = options.subtopics.find(({ id }) => id === subtopicId);
      return subtopic?.topicId === topicId ? [{ name: subtopic.name, index }] : [];
    });

    if (topic === undefined) return [];
    if (subtopics.length === 0) return [{ name: topic.name, list: 'topicIds', index: topicIndex }];
    return subtopics.map(({ name, index }) => ({
      name: `${topic.name}: ${name}`,
      list: 'subtopicIds',
      index,
    }));
  });
}

/**
 * The topic question: a select and its Add button. Choosing a topic with subtopics asks for one
 * of them instead, in a select whose button adds the two together. In the browser the subtopic
 * select follows the topic as it is chosen. Without JavaScript, Add topic sends the form back
 * to ask for the subtopic, so it stays beside the topic select.
 */
function TopicPicker({
  options,
  values,
  fieldErrors,
}: {
  options: TagOptions;
  values: TaggingPageValues;
  fieldErrors: FieldErrors;
}) {
  const selected = useSelectedValue<TaggingPageField>('addTopic', values.addTopic);
  const chosen = options.topics.find(({ id }) => id === selected.value);
  const subtopics = chosen === undefined ? [] : subtopicsOf(options, chosen.id);
  const offered = (list: 'topicIds' | 'subtopicIds') =>
    values[list].filter((id) => options[TAG_LIST_DETAILS[list].options].some((o) => o.id === id));
  const topicIds = offered('topicIds');
  const subtopicIds = offered('subtopicIds');

  return (
    <div className="govuk-!-margin-bottom-6">
      <div className="fphd-field-row fphd-field-row--with-button">
        <Select
          defaultValue={values.addTopic}
          // A topic without the subtopic it needs is refused on the topic question.
          error={fieldErrors.addTopic ?? fieldErrors.topicIds ?? fieldErrors.subtopicIds}
          label="Select a topic"
          labelHeading="h2"
          name="addTopic"
          onChange={selected.onChange}
          options={selectOptions(options.topics)}
        />
        {selected.hides(subtopics.length === 0) ? null : (
          <Button name="intent" value={addIntent('topicIds')}>
            Add topic
          </Button>
        )}
      </div>
      {chosen === undefined || subtopics.length === 0 ? null : (
        <div className="fphd-field-row fphd-field-row--with-button govuk-!-margin-top-3">
          <Select
            defaultValue={chosen.id === values.addTopic ? values.addSubtopic : ''}
            // The refusal was for the topic sent, not one chosen since.
            error={chosen.id === values.addTopic ? fieldErrors.addSubtopic : undefined}
            // Remounted for each topic, so the choice starts again with its subtopics.
            key={chosen.id}
            label={`Select a subtopic for ${chosen.name}`}
            labelHeading="h3"
            name="addSubtopic"
            options={selectOptions(subtopics)}
          />
          <Button name="intent" value={addIntent('subtopicIds')}>
            Add topic and subtopic
          </Button>
        </div>
      )}
      <HiddenIds ids={topicIds} list="topicIds" />
      <HiddenIds ids={subtopicIds} list="subtopicIds" />
      <AddedTags added={addedTopics(topicIds, subtopicIds, options)} noun="topic" />
    </div>
  );
}

/**
 * One list of tags: a select and its Add button, then the tags added so far, each carried in
 * a hidden field until Continue saves it. A tag the page no longer offers is left out.
 */
function TagPicker({
  list,
  options,
  values,
  fieldErrors,
  labelHeading,
}: {
  list: PickerList;
  options: readonly TagOption[];
  values: TaggingPageValues;
  fieldErrors: FieldErrors;
  labelHeading: ElementType;
}) {
  const { article, noun } = TAG_LIST_DETAILS[list];
  const field = ADD_TAG_FIELDS[list];
  const added = values[list].flatMap((id) => options.filter((option) => option.id === id));

  return (
    <div className="govuk-!-margin-bottom-6">
      {/* The select and its Add button side by side, as one control. */}
      <div className="fphd-field-row fphd-field-row--with-button">
        <Select
          // A list refused as a whole is shown on the select that adds to it.
          defaultValue={values[field]}
          error={fieldErrors[field] ?? fieldErrors[list]}
          label={`Select ${article} ${noun}`}
          labelHeading={labelHeading}
          name={field}
          options={selectOptions(options)}
        />
        <Button name="intent" value={addIntent(list)}>
          Add {noun}
        </Button>
      </div>
      <HiddenIds ids={added.map(({ id }) => id)} list={list} />
      <AddedTags added={added.map(({ name }, index) => ({ name, list, index }))} noun={noun} />
    </div>
  );
}

interface TaggingPageProps extends SectionPageProps<TaggingPageField, TaggingPageValues> {
  options: TagOptions;
}

export function TaggingPage({ options, ...form }: TaggingPageProps) {
  const { fieldErrors, values } = form;
  const picker = (list: PickerList, labelHeading: ElementType) => (
    <TagPicker
      fieldErrors={fieldErrors}
      labelHeading={labelHeading}
      list={list}
      options={options[TAG_LIST_DETAILS[list].options]}
      values={values}
    />
  );
  const yesNo = (
    name: 'hasFramework' | 'hasLifeStage' | 'hasRiskFactor',
    label: string,
    // Shown without JavaScript; with it, only while "Yes" is chosen.
    whenYes: ReactNode,
  ) => (
    <Radios
      defaultValue={values[name]}
      error={fieldErrors[name]}
      label={label}
      labelHeading="h2"
      name={name}
      options={[
        { label: 'Yes', value: 'yes', conditional: whenYes },
        { label: 'No', value: 'no' },
      ]}
    />
  );

  return (
    <IndicatorSectionForm
      continueOnEnter
      fieldIds={{
        topicIds: fieldInputId('addTopic'),
        subtopicIds: fieldInputId('addTopic'),
        hasFramework: firstRadioId('hasFramework'),
        frameworkIds: fieldInputId('addFramework'),
        hasLifeStage: firstRadioId('hasLifeStage'),
        lifeStageIds: fieldInputId('addLifeStage'),
        hasRiskFactor: firstRadioId('hasRiskFactor'),
        riskFactorIds: fieldInputId('addRiskFactor'),
      }}
      fields={FIELDS}
      form={form}
      intro={
        <p className="govuk-body">You can select as many tags as are relevant to this indicator.</p>
      }
      title="Add tags for this indicator"
    >
      <TopicPicker fieldErrors={fieldErrors} options={options} values={values} />
      <Select
        defaultValue={values.indicatorTypeIds[0] ?? ''}
        error={fieldErrors.indicatorTypeIds}
        label="Select a measure type"
        labelHeading="h2"
        name="indicatorTypeIds"
        options={selectOptions(options.indicatorTypes)}
      />
      {yesNo(
        'hasFramework',
        FRAMEWORK_QUESTION,
        <>
          {picker('frameworkIds', 'h3')}
          {values.frameworkIds.includes(CLASSIFICATION_IDS.publicHealthOutcomesFramework) ? (
            <TextInput
              autoComplete="off"
              className="govuk-input--width-10"
              defaultValue={values.phofIndicatorNumber}
              error={fieldErrors.phofIndicatorNumber}
              label="Enter PHOF indicator number"
              name="phofIndicatorNumber"
            />
          ) : null}
        </>,
      )}
      {yesNo('hasLifeStage', LIFE_STAGE_QUESTION, picker('lifeStageIds', 'h3'))}
      {yesNo('hasRiskFactor', RISK_FACTOR_QUESTION, picker('riskFactorIds', 'h3'))}
    </IndicatorSectionForm>
  );
}
