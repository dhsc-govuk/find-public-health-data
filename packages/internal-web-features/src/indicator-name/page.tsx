import { TextInput } from '@fphd/ui';

import { IndicatorSectionForm, QUESTION_HEADING_SIZE } from '../indicator-section-form.tsx';
import type { IndicatorNameFailure } from './loader.ts';

const NAME_FIELD = 'name';

const INDICATOR_NAME_HEADING = 'What is the name of the indicator?';

interface IndicatorNamePageProps {
  fieldErrors?: IndicatorNameFailure['fieldErrors'] | undefined;
  formError?: string | undefined;
  name?: string | undefined;
  /** The version of the name a rename was shown, which its save sends back. */
  version?: string | undefined;
}

// The heading is the field's label, as GOV.UK asks of a page with a single question.
export function IndicatorNamePage({
  fieldErrors = {},
  formError,
  name = '',
  version,
}: IndicatorNamePageProps) {
  return (
    <IndicatorSectionForm
      fields={[NAME_FIELD]}
      form={{ fieldErrors, formError, version }}
      questionIsHeading
      title={INDICATOR_NAME_HEADING}
    >
      <TextInput
        defaultValue={name}
        error={fieldErrors[NAME_FIELD]}
        hint="The name should be unique, descriptive and written in plain English."
        label={INDICATOR_NAME_HEADING}
        labelClassModifiers={QUESTION_HEADING_SIZE}
        labelHeading="h1"
        name={NAME_FIELD}
      />
    </IndicatorSectionForm>
  );
}
