import { Radios, Textarea } from '@fphd/ui';

import type { FormValues } from './form-values.ts';

interface YesNoQuestionProps<Field extends string> {
  /** The radios' field. Its Yes reveals the details field, and its No reveals any `noDetail`. */
  answer: Field;
  detail: Field;
  legend: string;
  hint?: string;
  detailLabel: string;
  detailRows: number;
  /** A details field that No reveals, for a question that asks for details under either answer. */
  noDetail?: { name: Field; label: string };
  values: FormValues<Field>;
  fieldErrors: Partial<Record<Field, string>>;
  /** Answers offered after Yes and No, such as "Not applicable". */
  moreOptions?: readonly { value: string; label: string }[];
}

/**
 * A yes/no question that asks for details under Yes, and under No as well when it is given
 * `noDetail`. Link its errors with `firstRadioId(answer)`.
 */
export function YesNoQuestion<Field extends string>({
  answer,
  detail,
  detailLabel,
  detailRows,
  fieldErrors,
  hint,
  legend,
  moreOptions = [],
  noDetail,
  values,
}: YesNoQuestionProps<Field>) {
  // Each details field is shown without JavaScript; with it, only while its answer is chosen.
  const detailsField = (name: Field, label: string) => (
    <Textarea
      defaultValue={values[name]}
      error={fieldErrors[name]}
      label={label}
      name={name}
      rows={detailRows}
    />
  );

  return (
    <Radios
      defaultValue={values[answer]}
      error={fieldErrors[answer]}
      hint={hint}
      label={legend}
      labelHeading="h2"
      name={answer}
      options={[
        { value: 'yes', label: 'Yes', conditional: detailsField(detail, detailLabel) },
        {
          value: 'no',
          label: 'No',
          conditional: noDetail && detailsField(noDetail.name, noDetail.label),
        },
        ...moreOptions,
      ]}
    />
  );
}
