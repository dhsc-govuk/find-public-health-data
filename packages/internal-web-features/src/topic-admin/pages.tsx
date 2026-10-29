import type { TopicFieldErrors } from '@fphd/internal-api-features/contract';
import {
  A,
  Button,
  DocumentTitle,
  ErrorSummary,
  type FieldError,
  formatDate,
  GridColumn,
  GridRow,
  NotificationBanner,
  PageIntro,
  Table,
  Textarea,
  TextInput,
} from '@fphd/ui';

import { VERSION_FIELD } from '../edit-version.ts';
import type { TopicFormValues } from './form.ts';
import type { TopicAdminDetailWithLinkCount, TopicAdminSummary } from './loader.ts';
import { deleteTopicPath, editTopicPath, NEW_TOPIC_PATH, TOPICS_ADMIN_PATH } from './paths.ts';

/** Summary order follows the form, so an error summary reads in the order the fields do. */
const FIELD_ORDER = ['title', 'slug', 'description'] as const;

const EMPTY_VALUES: TopicFormValues = { title: '', slug: '', description: '' };

function indicatorsLinked(count: number): string {
  return count === 1 ? '1 indicator is linked' : `${count} indicators are linked`;
}

function toErrorSummary(fieldErrors: TopicFieldErrors): FieldError[] {
  return FIELD_ORDER.flatMap((name) => {
    const message = fieldErrors[name];
    return message === undefined ? [] : [{ name, message }];
  });
}

// Two-thirds width: the table needs more than PageIntro's reading measure.
export function AdminTopicsPage({
  topics,
  notification,
}: {
  topics: TopicAdminSummary[];
  notification?: string | undefined;
}) {
  return (
    <GridRow>
      <GridColumn width="two-thirds">
        {notification === undefined ? null : (
          <NotificationBanner disableAutoFocus type="success">
            {notification}
          </NotificationBanner>
        )}
        <h1 className="govuk-heading-xl">Manage topics</h1>
        <Table
          caption="Topics"
          headings={{ title: 'Topic name', slug: 'Slug', updatedAt: 'Last updated' }}
          keys={['title', 'slug', 'updatedAt']}
          data={topics.map((topic) => ({
            title: <A href={editTopicPath(topic.id)}>{topic.title}</A>,
            slug: topic.slug,
            updatedAt: <time dateTime={topic.updatedAt}>{formatDate(topic.updatedAt)}</time>,
          }))}
        />
        <Button href={NEW_TOPIC_PATH}>Add a topic</Button>
      </GridColumn>
    </GridRow>
  );
}

interface TopicFieldsProps {
  fieldErrors: TopicFieldErrors;
  values: TopicFormValues;
  submitLabel: string;
  /** The version of the topic when the edit page was shown. The form sends it back. */
  version?: string;
}

// A plain form posting back to its own page, so it behaves the same with and without JavaScript.
function TopicFields({ fieldErrors, values, submitLabel, version }: TopicFieldsProps) {
  return (
    <form method="post">
      {version === undefined ? null : <input name={VERSION_FIELD} type="hidden" value={version} />}
      <TextInput
        defaultValue={values.title}
        error={fieldErrors.title}
        label="Topic name"
        name="title"
      />
      <TextInput
        defaultValue={values.slug}
        error={fieldErrors.slug}
        hint="Lowercase letters or numbers, separated by hyphens. It appears in the page address."
        label="Slug"
        name="slug"
      />
      <Textarea
        defaultValue={values.description}
        error={fieldErrors.description}
        label="Description"
        name="description"
      />
      <Button preventDoubleClick type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}

interface NewTopicPageProps {
  fieldErrors?: TopicFieldErrors | undefined;
  formError?: string | undefined;
  values?: TopicFormValues | undefined;
}

export function NewTopicPage({
  fieldErrors = {},
  formError,
  values = EMPTY_VALUES,
}: NewTopicPageProps) {
  const errors = toErrorSummary(fieldErrors);

  return (
    <>
      <DocumentTitle
        hasErrors={errors.length > 0 || formError !== undefined}
        pageTitle="Add a topic"
      />
      <ErrorSummary errors={errors} formError={formError} />
      <PageIntro title="Add a topic">
        <TopicFields fieldErrors={fieldErrors} submitLabel="Create topic" values={values} />
        <p className="govuk-body">
          <A href={TOPICS_ADMIN_PATH}>Return to topic list</A>
        </p>
      </PageIntro>
    </>
  );
}

interface EditTopicPageProps {
  fieldErrors?: TopicFieldErrors;
  formError?: string | undefined;
  linkedIndicatorCount: number;
  notification?: string | undefined;
  topicId: string;
  values: TopicFormValues;
  version: string;
}

export function EditTopicPage({
  fieldErrors = {},
  formError,
  linkedIndicatorCount,
  notification,
  topicId,
  values,
  version,
}: EditTopicPageProps) {
  const errors = toErrorSummary(fieldErrors);

  return (
    <>
      <DocumentTitle
        hasErrors={errors.length > 0 || formError !== undefined}
        pageTitle="Edit topic"
      />
      {notification === undefined ? null : (
        <NotificationBanner disableAutoFocus type="success">
          {notification}
        </NotificationBanner>
      )}
      <ErrorSummary errors={errors} formError={formError} />
      <PageIntro title="Edit topic">
        <TopicFields
          fieldErrors={fieldErrors}
          submitLabel="Save"
          values={values}
          version={version}
        />
        {linkedIndicatorCount === 0 ? (
          <>
            <p className="govuk-body">No indicators are linked to this topic.</p>
            <p className="govuk-body">
              <A href={deleteTopicPath(topicId)}>Delete topic</A>
            </p>
          </>
        ) : (
          <p className="govuk-body">
            {indicatorsLinked(linkedIndicatorCount)} to this topic. You cannot delete a topic while
            indicators are linked to it.
          </p>
        )}
        <p className="govuk-body">
          <A href={TOPICS_ADMIN_PATH}>Return to topic list</A>
        </p>
      </PageIntro>
    </>
  );
}

export function DeleteTopicPage({ topic }: { topic: TopicAdminDetailWithLinkCount }) {
  if (topic.linkedIndicatorCount > 0) {
    return (
      <PageIntro title="Delete topic">
        <p className="govuk-body">
          You cannot delete <strong>{topic.title}</strong> because{' '}
          {indicatorsLinked(topic.linkedIndicatorCount)} to it.
        </p>
        <p className="govuk-body">
          <A href={editTopicPath(topic.id)}>Return to edit topic</A>
        </p>
      </PageIntro>
    );
  }

  return (
    <PageIntro title="Delete topic">
      <p className="govuk-body">
        Are you sure you want to delete <strong>{topic.title}</strong>? This cannot be undone.
      </p>
      {/* Plain form so it works without JavaScript; the POST is the confirmation. */}
      <form method="post">
        <Button classModifiers="warning" preventDoubleClick type="submit">
          Delete topic
        </Button>
      </form>
      <p className="govuk-body">
        <A href={editTopicPath(topic.id)}>Cancel</A>
      </p>
    </PageIntro>
  );
}
