import { Button, DocumentTitle, ErrorSummary, GridColumn, GridRow } from '@fphd/ui';
import type { ReactNode } from 'react';

import { VERSION_FIELD } from './edit-version.ts';
import type { FormValues } from './form-values.ts';

/**
 * The size a question keeps when it is the page heading. NotGovUK sizes an h1 label or legend
 * `l`, as the GOV.UK question page pattern does; we are a step larger everywhere, so pinning it
 * here holds the page as it was. Remove once FPH-510 settles the scale for the whole application.
 */
export const QUESTION_HEADING_SIZE = 'xl';

/**
 * The props every section page gets: its answers, their version, and any errors from the last
 * submission.
 */
export interface SectionPageProps<Field extends string, Values = FormValues<Field>> {
  fieldErrors: Partial<Record<Field, string>>;
  /** Required, so no page can drop a refusal that names no field. */
  formError: string | undefined;
  values: Values;
  version: string;
}

type IndicatorSectionFormProps<Field extends string> = {
  /** The page's h1 and its document title. */
  title: string;
  /** Set when the page asks one question whose label or legend is the h1, so none is added. */
  questionIsHeading?: boolean;
  /**
   * The errors for the error summary, and the version of the answers shown. If given, the
   * version goes in a hidden field so the save sends it back.
   */
  form: Omit<SectionPageProps<Field, unknown>, 'values' | 'version'> & {
    version?: string | undefined;
  };
  /** Where a summary link goes when it is not the field's own input, such as `firstRadioId`. */
  fieldIds?: Partial<Record<Field, string>>;
  /** Set when the form has buttons of its own before Continue, which Enter would otherwise press. */
  continueOnEnter?: boolean;
  children: ReactNode;
} & (
  | {
      /** The section the page answers, whose fields it asks in their order. */
      section: { fields: { options: readonly Field[] } };
      fields?: never;
    }
  | {
      /** Every field, in the order the page asks them, where they are not its section's alone. */
      fields: readonly Field[];
      section?: never;
    }
);

/** The frame of a section page: title, error summary, and a form that continues to the task list. */
export function IndicatorSectionForm<Field extends string>(
  props: IndicatorSectionFormProps<Field>,
) {
  const {
    children,
    continueOnEnter = false,
    form: { fieldErrors, formError, version },
    questionIsHeading = false,
    title,
  } = props;
  const fieldIds: Partial<Record<Field, string>> = props.fieldIds ?? {};
  const fields = props.fields ?? props.section.fields.options;
  // A message given on several fields, such as the parts of a date, links to the first of them.
  const errors = fields.flatMap((name, index) => {
    const message = fieldErrors[name];
    const repeated = fields.slice(0, index).some((earlier) => fieldErrors[earlier] === message);
    return message === undefined || repeated ? [] : [{ name, message, id: fieldIds[name] }];
  });

  return (
    <>
      <DocumentTitle hasErrors={errors.length > 0 || formError !== undefined} pageTitle={title} />
      <ErrorSummary errors={errors} formError={formError} />
      <GridRow>
        <GridColumn width="two-thirds">
          {questionIsHeading ? null : <h1 className="govuk-heading-xl">{title}</h1>}
          {/* A plain form posting back to its own page, so it works without JavaScript. */}
          <form method="post">
            {version === undefined ? null : (
              <input name={VERSION_FIELD} type="hidden" value={version} />
            )}
            {/* Enter presses a form's first submit button: this Continue, out of sight and reach. */}
            {continueOnEnter ? (
              <button
                aria-hidden="true"
                className="govuk-visually-hidden"
                tabIndex={-1}
                type="submit"
              >
                Continue
              </button>
            ) : null}
            {children}
            <Button preventDoubleClick type="submit">
              Continue
            </Button>
          </form>
        </GridColumn>
      </GridRow>
    </>
  );
}
