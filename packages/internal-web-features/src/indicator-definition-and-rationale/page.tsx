import {
  type DefinitionAndRationaleField,
  definitionAndRationaleSection,
} from '@fphd/internal-api-features/contract';
import { Textarea } from '@fphd/ui';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';

export function DefinitionAndRationalePage(form: SectionPageProps<DefinitionAndRationaleField>) {
  const { fieldErrors, values } = form;

  return (
    <IndicatorSectionForm
      guidance="definition"
      form={form}
      section={definitionAndRationaleSection}
      title="Definition and rationale"
    >
      <Textarea
        defaultValue={values.definition}
        error={fieldErrors.definition}
        label="What is the definition of this indicator?"
        labelHeading="h2"
        name="definition"
        rows={8}
      />
      <Textarea
        defaultValue={values.rationale}
        error={fieldErrors.rationale}
        label="What is the rationale for this indicator?"
        labelHeading="h2"
        name="rationale"
        rows={15}
      />
    </IndicatorSectionForm>
  );
}
