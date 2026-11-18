import Hint from '@not-govuk/hint';
import Label from '@not-govuk/label';
import SearchBox from '@not-govuk/search-box';
import type { ReactNode } from 'react';

// SearchBox hides its own label, so render the page's heading-style label alongside it.
export function SearchField({
  action,
  defaultValue,
  hint,
  id,
  label,
  labelSize = 'm',
  name,
}: {
  action?: ReactNode;
  defaultValue?: string;
  hint?: string;
  id: string;
  label: string;
  labelSize?: 's' | 'm' | 'l';
  name: string;
}) {
  const inputId = `${id}-input`;
  return (
    <div className="govuk-form-group">
      <div className="fphd-search-bar__label-row">
        <Label className="govuk-!-margin-bottom-0" classModifiers={labelSize} htmlFor={inputId}>
          {label}
        </Label>
        {action}
      </div>
      {/* FIXME(FPH-798): The hint is not linked to the input, because NotGovUK's SearchBox
          overwrites any aria-describedby passed to it and shows its own hint only visually
          hidden and as placeholder text. Link it once SearchBox keeps an aria-describedby or
          offers a visible hint without a placeholder. */}
      {hint ? <Hint>{hint}</Hint> : null}
      <SearchBox
        autoComplete="off"
        className="fphd-search-bar"
        defaultValue={defaultValue}
        id={id}
        label=""
        maxLength={200}
        name={name}
        type="search"
      />
    </div>
  );
}
