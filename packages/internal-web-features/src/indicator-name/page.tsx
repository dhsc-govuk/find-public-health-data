import { TextInput } from '@fphd/ui';

import { IndicatorSectionForm } from '../indicator-section-form.tsx';
import type { IndicatorNameFailure } from './loader.ts';
import { NEW_INDICATOR_ID_FIELD } from './new-indicator-id.ts';

const NAME_FIELD = 'name';

const INDICATOR_NAME_HEADING = 'What is the name of the indicator?';

interface IndicatorNamePageProps {
  fieldErrors?: IndicatorNameFailure['fieldErrors'] | undefined;
  formError?: string | undefined;
  name?: string | undefined;
  /** The id a new indicator takes, which the form sends; a draft being renamed has none. */
  newIndicatorId?: string | undefined;
  /** The version of the name when the page was shown. The form sends it back. */
  version?: string | undefined;
}

// The question is the page's h1, with the guidance link under it. The field's label repeats the
// question for screen readers only.
export function IndicatorNamePage({
  fieldErrors = {},
  formError,
  name = '',
  newIndicatorId,
  version,
}: IndicatorNamePageProps) {
  return (
    <IndicatorSectionForm
      guidance="name"
      fields={[NAME_FIELD]}
      form={{ fieldErrors, formError, version }}
      title={INDICATOR_NAME_HEADING}
    >
      {newIndicatorId === undefined ? null : (
        // Without autocomplete off, Firefox puts back the id from before a reload.
        <input
          autoComplete="off"
          name={NEW_INDICATOR_ID_FIELD}
          type="hidden"
          value={newIndicatorId}
        />
      )}
      <TextInput
        defaultValue={name}
        error={fieldErrors[NAME_FIELD]}
        label={<span className="govuk-visually-hidden">{INDICATOR_NAME_HEADING}</span>}
        name={NAME_FIELD}
      />
    </IndicatorSectionForm>
  );
}
