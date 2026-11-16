import {
  indicatorSectionFieldErrors,
  subtopicRequiredMessage,
  subtopicsOf,
  TAG_LIST_DETAILS,
  TAG_LISTS,
  type TaggingField,
  type TaggingFormValues,
  type TagList,
  type TagOptions,
  taggingSection,
} from '@fphd/internal-api-features/contract';

import { readFormValues } from '../form-values.ts';
import type { FormFailure, SectionAnswers } from '../indicator-section.ts';
import { type ListIntent, readListIntent } from '../list-form.ts';

/**
 * The select that adds a tag to each list. A subtopic is added with its topic, so the subtopic
 * select is shown only once a topic with subtopics has been chosen.
 */
export const ADD_TAG_FIELDS = {
  topicIds: 'addTopic',
  subtopicIds: 'addSubtopic',
  indicatorTypeIds: 'addIndicatorType',
  frameworkIds: 'addFramework',
  lifeStageIds: 'addLifeStage',
  riskFactorIds: 'addRiskFactor',
} as const satisfies Record<TagList, string>;

type AddTagField = (typeof ADD_TAG_FIELDS)[TagList];

/** The page's answers, and the tag chosen in each select but not yet added. */
export type TaggingPageValues = TaggingFormValues & Record<AddTagField, string>;

export type TaggingPageField = TaggingField | AddTagField;

/** The page as the action re-renders it: after a refusal, or with a tag added or removed. */
export type TaggingPageState = FormFailure<TaggingPageField, TaggingPageValues>;

/** The lists a topic and its subtopic are added to together, and removed from together. */
const TOPIC_LISTS: readonly TagList[] = ['topicIds', 'subtopicIds'];

/** The page with nothing chosen in the selects that add a tag. */
export function taggingPageValues(values: TaggingFormValues): TaggingPageValues {
  return {
    ...values,
    addTopic: '',
    addSubtopic: '',
    addIndicatorType: '',
    addFramework: '',
    addLifeStage: '',
    addRiskFactor: '',
  };
}

/** The form as sent, and which of its buttons sent it; a field not sent is empty. */
export function readTaggingForm(formData: FormData): {
  values: TaggingPageValues;
  intent: ListIntent<TagList>;
} {
  const ids = (list: TagList) =>
    formData.getAll(list).filter((id): id is string => typeof id === 'string');

  return {
    values: {
      ...readFormValues(formData, [
        'hasFramework',
        'phofIndicatorNumber',
        'hasLifeStage',
        'hasRiskFactor',
        ...Object.values(ADD_TAG_FIELDS),
      ]),
      topicIds: ids('topicIds'),
      subtopicIds: ids('subtopicIds'),
      indicatorTypeIds: ids('indicatorTypeIds'),
      frameworkIds: ids('frameworkIds'),
      lifeStageIds: ids('lifeStageIds'),
      riskFactorIds: ids('riskFactorIds'),
    },
    intent: readListIntent(formData, TAG_LISTS),
  };
}

/** The ids with `id` added once, at the end. */
function withId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? [...ids] : [...ids, id];
}

/** The values with the tag chosen for `list` added once, and its select cleared. */
function withChosen(values: TaggingPageValues, list: TagList): TaggingPageValues {
  const field = ADD_TAG_FIELDS[list];

  return { ...values, [list]: withId(values[list], values[field]), [field]: '' };
}

/** The topic chosen with the subtopic chosen under it added, both selects cleared. */
function withTopicAndSubtopic(values: TaggingPageValues, subtopicId?: string): TaggingPageValues {
  return {
    ...values,
    topicIds: withId(values.topicIds, values.addTopic),
    subtopicIds:
      subtopicId === undefined ? values.subtopicIds : withId(values.subtopicIds, subtopicId),
    addTopic: '',
    addSubtopic: '',
  };
}

/**
 * The topic chosen, added at once if it has no subtopics. A topic with subtopics stays chosen,
 * so the page asks for one of them, or refuses if one was asked for but not chosen.
 */
function withChosenTopic(
  values: TaggingPageValues,
  options: TagOptions,
  subtopicAsked: boolean,
): TaggingPageValues | TaggingPageState {
  const subtopics = subtopicsOf(options, values.addTopic);
  if (subtopics.length === 0) return withTopicAndSubtopic(values);

  const chosen = subtopics.find(({ id }) => id === values.addSubtopic);
  if (chosen !== undefined) return withTopicAndSubtopic(values, chosen.id);

  const topic = options.topics.find(({ id }) => id === values.addTopic);
  if (!subtopicAsked || topic === undefined) return { ...values, addSubtopic: '' };

  return { values, fieldErrors: { addSubtopic: subtopicRequiredMessage(topic) } };
}

/**
 * The page with the tag chosen for `list` added, or asking for one. Adding a framework, a life
 * stage or a risk factor answers "Yes", which a form without JavaScript may not have chosen.
 * "Add topic" on a topic with subtopics asks for a subtopic, which "Add topic and subtopic"
 * then adds with it.
 */
export function withTagAdded(
  values: TaggingPageValues,
  list: TagList,
  options: TagOptions,
): TaggingPageState {
  const { article, noun, question } = TAG_LIST_DETAILS[list];

  if (TOPIC_LISTS.includes(list)) {
    if (values.addTopic === '') return { values, fieldErrors: { addTopic: 'Select a topic' } };

    const added = withChosenTopic(values, options, list === 'subtopicIds');
    return 'fieldErrors' in added ? added : { values: added, fieldErrors: {} };
  }

  const field = ADD_TAG_FIELDS[list];
  if (values[field] === '') {
    return { values, fieldErrors: { [field]: `Select ${article} ${noun}` } };
  }

  const added = withChosen(values, list);

  return {
    values: question === null ? added : { ...added, [question]: 'yes' },
    fieldErrors: {},
  };
}

/**
 * The page without the tag at `index` of `list`, keeping everything else as sent. A topic is
 * shown with each subtopic chosen under it, so removing its last subtopic removes the topic.
 */
export function withTagRemoved(
  values: TaggingPageValues,
  list: TagList,
  index: number,
  options: TagOptions,
): TaggingPageState {
  const removed = values[list][index];
  const kept = { ...values, [list]: values[list].filter((_, at) => at !== index) };
  const topicId = options.subtopics.find(({ id }) => id === removed)?.topicId;
  const orphaned =
    list === 'subtopicIds' &&
    topicId !== undefined &&
    !subtopicsOf(options, topicId).some(({ id }) => kept.subtopicIds.includes(id));

  return {
    values: orphaned ? { ...kept, topicIds: kept.topicIds.filter((id) => id !== topicId) } : kept,
    fieldErrors: {},
  };
}

/** The values with every tag chosen for a list other than topics taken in, except beside a "No". */
function withOtherTagsTakenIn(sent: TaggingPageValues): TaggingPageValues {
  return TAG_LISTS.filter((list) => !TOPIC_LISTS.includes(list)).reduce((current, list) => {
    const { question } = TAG_LIST_DETAILS[list];
    const wanted = question === null || current[question] !== 'no';

    return wanted && current[ADD_TAG_FIELDS[list]] !== '' ? withChosen(current, list) : current;
  }, sent);
}

/**
 * The answers with every tag chosen but not added taken in, except beside a "No". A topic with
 * subtopics is taken in only with one of them. Without one, the page is refused with every other
 * refusal of the answers beside it, but without asking for a topic, as one is chosen.
 */
export function withChosenTagsTakenIn(
  sent: TaggingPageValues,
  options: TagOptions,
): SectionAnswers<TaggingPageValues, TaggingFormValues> | TaggingPageState {
  const topics =
    sent.addTopic === '' ? { ...sent, addSubtopic: '' } : withChosenTopic(sent, options, true);

  if ('fieldErrors' in topics) {
    const values = withOtherTagsTakenIn(topics.values);
    const checked = taggingSection.schema.safeParse(values);
    const { topicIds: _, ...refused } = checked.success
      ? {}
      : indicatorSectionFieldErrors(taggingSection, checked.error);

    return { values, fieldErrors: { ...refused, ...topics.fieldErrors } };
  }

  const values = withOtherTagsTakenIn(topics);

  return { values, answers: values };
}
