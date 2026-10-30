import { requireApiActor } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { Router } from 'express';

import { indicatorIdSchema, indicatorSectionFieldErrors } from './contract.ts';
import { editVersion } from './edit-version.ts';
import type { IndicatorDraft, IndicatorDraftAttributes } from './indicator-draft-repository.ts';
import { requireIndicatorEditor } from './indicator-editor.ts';
import {
  type DetailedQuestion,
  type IndicatorSection,
  type IndicatorSectionFields,
  indicatorSectionSaveSchema,
} from './indicator-section-contract.ts';
import type { IndicatorDraftLists } from './indicator-version-lists-repository.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

/** The draft columns a section writes: never the name, whose slug is the name page's concern. */
type IndicatorSectionAttributes = Omit<IndicatorDraftAttributes, 'name'>;

/** The draft as the sections read it: all but its identity, name and audit trail. */
export type IndicatorSectionDraft = Omit<
  IndicatorDraft,
  | 'createdAt'
  | 'createdBy'
  | 'id'
  | 'indicatorId'
  | 'isLocked'
  | 'name'
  | 'publishedAt'
  | 'slug'
  | 'status'
  | 'updatedAt'
  | 'updatedBy'
>;

/**
 * How a section's answers map onto the draft's columns and lists, in both directions. The
 * answers are each field's text, or null, unless the section says otherwise.
 */
export interface IndicatorSectionColumns<
  Field extends string,
  Values,
  Answers = Record<Field, string | null>,
> {
  fromDraft(draft: IndicatorSectionDraft): Answers;
  toAttributes(values: Values): IndicatorSectionAttributes;
  /** For a section that also writes lists; one it returns replaces the draft's. */
  toLists?(values: Values): IndicatorDraftLists;
}

/** The draft's text columns, which a field of the same name reads and writes as it is. */
type TextColumn = {
  [Column in keyof IndicatorSectionDraft]: IndicatorSectionDraft[Column] extends string | null
    ? Column
    : never;
}[keyof IndicatorSectionDraft];

/** For a section whose every field is the draft column of the same name. */
export function sameNamedColumns<
  Field extends TextColumn,
  Values extends IndicatorSectionAttributes,
>(fields: IndicatorSectionFields<Field>): IndicatorSectionColumns<Field, Values> {
  return {
    fromDraft: (draft) =>
      Object.fromEntries(fields.options.map((field) => [field, draft[field]])) as Record<
        Field,
        string | null
      >,
    toAttributes: (values) => values,
  };
}

/** The draft's yes/no columns, which a form answers "yes" or "no". */
type BooleanColumn = {
  [Column in keyof IndicatorSectionDraft]: IndicatorSectionDraft[Column] extends boolean | null
    ? Column
    : never;
}[keyof IndicatorSectionDraft];

/** A stored yes/no as the form answers it. */
export function yesNoAnswer(answer: boolean | null): 'yes' | 'no' | null {
  if (answer === null) return null;
  return answer ? 'yes' : 'no';
}

/** A detail is kept beside a yes alone, whatever the form sent. */
export function detailOf(answer: string, detail: string): string | null {
  return answer === 'yes' ? detail : null;
}

/** Nothing, or a property naming the yes/no columns no question answers, which fails the call. */
type Asks<Unasked extends string> = [Unasked] extends [never]
  ? unknown
  : { yesNoWithoutQuestion: Unasked };

/**
 * For a section whose every field is the draft column of the same name: text as it is, and
 * each yes/no question stored as a boolean, its details kept beside a yes alone. The questions
 * are the ones the section's schema requires details for; a yes/no column no question names
 * does not compile.
 */
export function yesNoDetailColumns<
  Field extends TextColumn | BooleanColumn,
  Values extends Record<Field, string>,
  Question extends DetailedQuestion<Field & BooleanColumn, Field & TextColumn>,
>(
  section: IndicatorSection<Field, Values>,
  questions: readonly Question[] & Asks<Exclude<Extract<Field, BooleanColumn>, Question['answer']>>,
): IndicatorSectionColumns<Field, Values> {
  const answers = new Set<Field>(questions.map(({ answer }) => answer));
  const isAnswer = (field: Field): field is Question['answer'] => answers.has(field);
  const answerOf = new Map<Field, Question['answer']>(
    questions.map(({ answer, detail }) => [detail, answer]),
  );

  return {
    fromDraft: (draft) =>
      Object.fromEntries(
        section.fields.options.map((field) => [
          field,
          isAnswer(field) ? yesNoAnswer(draft[field]) : draft[field],
        ]),
      ) as Record<Field, string | null>,
    toAttributes: (values) =>
      Object.fromEntries(
        section.fields.options.map((field) => {
          const answer = answerOf.get(field);

          if (isAnswer(field)) return [field, values[field] === 'yes'];
          return [field, answer ? detailOf(values[answer], values[field]) : values[field]];
        }),
      ) as IndicatorSectionAttributes,
  };
}

/**
 * GET and PUT `/api/internal/indicators/:id/<key>` for one section of a draft.
 *
 * Both return the section's answers and a version of them. A PUT sends back the version its
 * form was shown. If the section has changed since, the PUT is rejected with 409 `changed`, so
 * nobody overwrites an edit they haven't seen. Changes to other sections don't count. A PUT
 * saves all its answers or, if any is invalid, none.
 *
 * Other errors:
 * - 404 `no_draft`: the indicator exists but has no draft. A published indicator needs a
 *   draft opened before its sections can be edited.
 * - 404 `not_found`: the indicator doesn't exist.
 * - 409 `locked`: the draft is locked for review.
 */
export function indicatorSectionRouter<
  Field extends string,
  Values,
  Input,
  ErrorField extends string,
  Answers,
>(
  indicators: InternalIndicatorRepository,
  session: JwtSessionVerifier,
  section: IndicatorSection<Field, Values, Input, ErrorField, Answers>,
  columns: IndicatorSectionColumns<Field, Values, Answers>,
): Router {
  const router = Router();
  const requireEditor = requireIndicatorEditor(session, indicators);
  const path = `/api/internal/indicators/:id/${section.key}`;
  const versionOf = (draft: IndicatorSectionDraft) => editVersion(columns.fromDraft(draft));
  const withVersion = (draft: IndicatorSectionDraft) => ({
    answers: columns.fromDraft(draft),
    version: versionOf(draft),
  });

  router.get(path, requireEditor, async (request, response) => {
    const id = indicatorIdSchema.safeParse(request.params.id);

    if (!id.success) {
      response.status(400).json({ error: 'invalid_id' });
      return;
    }

    const row = await indicators.findDraftState(id.data);

    if (!row?.draft) {
      response.status(404).json({ error: row ? 'no_draft' : 'not_found' });
      return;
    }

    if (row.draft.isLocked) {
      response.status(409).json({ error: 'locked' });
      return;
    }

    response.status(200).json(withVersion(row.draft));
  });

  router.put(path, requireEditor, async (request, response) => {
    const id = indicatorIdSchema.safeParse(request.params.id);

    if (!id.success) {
      response.status(400).json({ error: 'invalid_id' });
      return;
    }

    const save = indicatorSectionSaveSchema.safeParse(request.body);

    if (!save.success) {
      response.status(400).json({ error: 'invalid_version' });
      return;
    }

    // Async, because a section's API-side schema may check an answer against a lookup.
    const submission = await section.schema.safeParseAsync(save.data.answers);

    if (!submission.success) {
      // A locked draft refuses every save, so a refused answer is not what to report.
      if ((await indicators.findById(id.data))?.draftLocked) {
        response.status(409).json({ error: 'locked' });
        return;
      }

      response.status(400).json({
        error: 'validation_failed',
        fieldErrors: indicatorSectionFieldErrors(section, submission.error),
      });
      return;
    }

    const actor = requireApiActor(request, response);
    const attributes = columns.toAttributes(submission.data);
    const lists = columns.toLists?.(submission.data) ?? {};
    const result = await indicators.updateDraft(id.data, attributes, lists, actor, {
      version: save.data.version,
      versionOf,
    });

    if (!result.ok && result.reason === 'locked') {
      response.status(409).json({ error: 'locked' });
      return;
    }

    if (!result.ok && result.reason === 'changed') {
      response.status(409).json({ error: 'changed', version: result.version });
      return;
    }

    // With no name in the write there is no slug to collide on, so this refusal means no draft.
    if (!result.ok) {
      const exists = (await indicators.findDraftState(id.data)) !== undefined;
      response.status(404).json({ error: exists ? 'no_draft' : 'not_found' });
      return;
    }

    const row = await indicators.findDraftState(id.data);

    if (!row?.draft) throw new Error('the draft just saved could not be read back');

    request.log.info(
      { indicatorId: row.id, shortId: row.shortId, section: section.key },
      'Indicator section saved',
    );
    response.status(200).json(withVersion(row.draft));
  });

  return router;
}
