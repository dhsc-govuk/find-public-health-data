import {
  flaggableTaskKeySchema,
  type ReviewResponseField,
  type ReviewResponseKind,
} from '@fphd/internal-api-features/contract';
import {
  Checkboxes,
  DateInput,
  datePartId,
  firstCheckboxId,
  firstRadioId,
  formatDate,
  Radios,
  Textarea,
} from '@fphd/ui';

import { IndicatorSectionForm, QUESTION_HEADING_SIZE } from '../indicator-section-form.tsx';
import { TASK_GROUPS } from '../indicator-tasks.ts';
import {
  type ApprovalValues,
  type DateValues,
  flagNotesName,
  REVIEW_DATE,
  REVIEW_DATE_PARTS,
  type ResponseTypeValues,
  type RevisionsValues,
} from './form.ts';

/** What every response page gets: its answers so far, and the errors of the last attempt. */
interface ReviewPageProps<Field extends string, Values> {
  values: Values;
  fieldErrors: Partial<Record<Field, string>>;
  formError: string | undefined;
}

/** The indicator as the date and approval pages recap it, above their question. */
interface Recap {
  name: string;
  scheduledPublishAt: string | null;
}

function RecapList({ name, scheduledPublishAt }: Recap) {
  return (
    <ul className="govuk-list">
      <li>
        <strong>Indicator name:</strong> {name}
      </li>
      {scheduledPublishAt === null ? null : (
        <li>
          <strong>Scheduled publication date:</strong>{' '}
          <time dateTime={scheduledPublishAt}>
            {formatDate(scheduledPublishAt, 'longWithTime')}
          </time>
        </li>
      )}
    </ul>
  );
}

const RESPONSE_TYPE_QUESTION = 'What response are you submitting?';

export function ResponseTypePage({
  submissionNumber,
  ...form
}: ReviewPageProps<'responseType', ResponseTypeValues> & { submissionNumber: number }) {
  return (
    <IndicatorSectionForm
      fieldIds={{ responseType: firstRadioId('responseType') }}
      fields={['responseType']}
      form={form}
      questionIsHeading
      title={RESPONSE_TYPE_QUESTION}
    >
      <input name="submissionNumber" type="hidden" value={submissionNumber} />
      <Radios
        defaultValue={form.values.responseType}
        error={form.fieldErrors.responseType}
        label={RESPONSE_TYPE_QUESTION}
        labelClassModifiers={QUESTION_HEADING_SIZE}
        labelHeading="h1"
        name="responseType"
        options={[
          { value: 'pre_imrg_feedback', label: 'Pre-IMRG meeting feedback' },
          { value: 'imrg_decision', label: 'IMRG review decision' },
        ]}
      />
    </IndicatorSectionForm>
  );
}

const DATE_QUESTION = 'When was this indicator reviewed by IMRG?';
const DATE_FIELDS = ['imrgReviewedOnDay', 'imrgReviewedOnMonth', 'imrgReviewedOnYear'] as const;

export function ReviewDatePage({
  recap,
  ...form
}: ReviewPageProps<keyof DateValues, DateValues> & { recap: Recap }) {
  const { fieldErrors, values } = form;
  const errors = Object.fromEntries(
    DATE_FIELDS.flatMap((field) =>
      fieldErrors[field] === undefined ? [] : [[REVIEW_DATE_PARTS[field], fieldErrors[field]]],
    ),
  );

  return (
    <IndicatorSectionForm
      fieldIds={Object.fromEntries(
        DATE_FIELDS.map((field) => [field, datePartId(REVIEW_DATE, REVIEW_DATE_PARTS[field])]),
      )}
      fields={DATE_FIELDS}
      form={form}
      questionIsHeading
      title={DATE_QUESTION}
    >
      <DateInput
        defaultValue={{
          day: values.imrgReviewedOnDay,
          month: values.imrgReviewedOnMonth,
          year: values.imrgReviewedOnYear,
        }}
        error={Object.keys(errors).length === 0 ? undefined : errors}
        hint={
          <>
            <RecapList {...recap} />
            For example, 14 9 2026
          </>
        }
        label={DATE_QUESTION}
        labelClassModifiers={QUESTION_HEADING_SIZE}
        labelHeading="h1"
        name={REVIEW_DATE}
      />
    </IndicatorSectionForm>
  );
}

const APPROVAL_QUESTION = 'Was this indicator approved for publishing?';

export function ApprovalPage({
  recap,
  ...form
}: ReviewPageProps<keyof ApprovalValues, ApprovalValues> & { recap: Recap }) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      fieldIds={{
        approved: firstRadioId('approved'),
        revisionsKind: firstRadioId('revisionsKind'),
      }}
      fields={['approved', 'revisionsKind']}
      form={form}
      questionIsHeading
      title={APPROVAL_QUESTION}
    >
      <Radios
        defaultValue={values.approved}
        error={fieldErrors.approved}
        hint={<RecapList {...recap} />}
        label={APPROVAL_QUESTION}
        labelClassModifiers={QUESTION_HEADING_SIZE}
        labelHeading="h1"
        name="approved"
        options={[
          { value: 'yes', label: 'Yes' },
          {
            value: 'no',
            label: 'No',
            // Shown without JavaScript; with it, only while No is chosen.
            conditional: (
              <Radios
                classModifiers="small"
                defaultValue={values.revisionsKind}
                error={fieldErrors.revisionsKind}
                label="Select a reason"
                labelClassModifiers="s"
                name="revisionsKind"
                options={[
                  { value: 'minor_revisions', label: 'Minor revisions needed' },
                  { value: 'major_revisions', label: 'Major revisions needed' },
                ]}
              />
            ),
          },
        ]}
      />
    </IndicatorSectionForm>
  );
}

const REVISIONS_TITLE = 'What needs to be revised or clarified?';

/** The groups a reviewer flags tasks from: the task list's, without the notes for reviewers. */
const FLAG_GROUPS = TASK_GROUPS.map((group) => ({
  ...group,
  tasks: group.tasks.flatMap(({ key, title }) => {
    const task = flaggableTaskKeySchema.safeParse(key);
    return task.success ? [{ key: task.data, title }] : [];
  }),
})).filter(({ tasks }) => tasks.length > 0);

const REVISIONS_FIELDS: readonly ReviewResponseField[] = [
  'flags',
  'clarificationRequest',
  ...FLAG_GROUPS.flatMap(({ tasks }) => tasks.map(({ key }) => flagNotesName(key))),
];

export function RevisionsPage({
  kind,
  ...form
}: ReviewPageProps<ReviewResponseField, RevisionsValues> & {
  kind: Exclude<ReviewResponseKind, 'approved'>;
}) {
  const { fieldErrors, values } = form;
  const notesLabel =
    kind === 'pre_imrg_feedback'
      ? 'Enter advised revisions or clarification request'
      : 'Enter required revisions';

  return (
    <IndicatorSectionForm
      fieldIds={{ flags: firstCheckboxId('clarification') }}
      fields={REVISIONS_FIELDS}
      form={form}
      title={REVISIONS_TITLE}
    >
      <Checkboxes
        classModifiers="small"
        defaultValue={values.clarification ? ['yes'] : []}
        error={fieldErrors.flags}
        label="Indicator"
        labelClassModifiers="m"
        labelHeading="h2"
        name="clarification"
        options={[
          {
            value: 'yes',
            label: 'High-level clarification request',
            conditional: (
              <Textarea
                defaultValue={values.clarificationRequest}
                error={fieldErrors.clarificationRequest}
                label="What are you requesting clarification about?"
                name="clarificationRequest"
                rows={3}
              />
            ),
          },
        ]}
      />
      {FLAG_GROUPS.map(({ id, title, tasks }) => (
        <Checkboxes
          classModifiers="small"
          defaultValue={values.flags}
          id={`flags-${id}`}
          key={id}
          label={title}
          labelClassModifiers="m"
          labelHeading="h2"
          name="flags"
          options={tasks.map(({ key, title: taskTitle }) => {
            const notes = flagNotesName(key);
            return {
              value: key,
              label: taskTitle,
              conditional: (
                <Textarea
                  defaultValue={values.notes[key] ?? ''}
                  error={fieldErrors[notes]}
                  label={notesLabel}
                  name={notes}
                  rows={3}
                />
              ),
            };
          })}
        />
      ))}
    </IndicatorSectionForm>
  );
}
