import { type AutocompleteOption, Button, Checkboxes } from '@fphd/ui';
import { useEffect, useId, useState } from 'react';
import { Form } from 'react-router';
import { LIST_PARAMS, PERIOD_PARAMS, type SearchState } from './url.ts';

export function HiddenFilters({
  state,
  except,
  extraParams = {},
}: {
  state: SearchState;
  except?: keyof SearchState | (keyof SearchState)[];
  extraParams?: Record<string, string>;
}) {
  const excluded = new Set(Array.isArray(except) ? except : [except]);
  return (
    <>
      {Object.entries(extraParams).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      {!excluded.has('q') && state.q ? <input name="q" type="hidden" value={state.q} /> : null}
      {!excluded.has('subtopics')
        ? state.subtopics?.map((slug) => (
            <input key={slug} name="subtopic" type="hidden" value={slug} />
          ))
        : null}
      {PERIOD_PARAMS.map((name) =>
        !excluded.has(name) && state[name] ? (
          <input key={name} name={name} type="hidden" value={state[name]} />
        ) : null,
      )}
      {LIST_PARAMS.filter(({ stateKey }) => !excluded.has(stateKey)).map(({ param, stateKey }) =>
        (state[stateKey] as string[]).map((v) => (
          <input key={`${param}-${v}`} name={param} type="hidden" value={v} />
        )),
      )}
    </>
  );
}

export function FilterDimensionChoices({
  action,
  extraParams,
  label,
  options,
  param,
  state,
  stateKey,
  onChange,
}: {
  action: string;
  extraParams: Record<string, string>;
  label: string;
  options: AutocompleteOption[];
  param: string;
  state: SearchState;
  stateKey: keyof SearchState;
  onChange: (values: string[]) => void;
}) {
  const id = useId();
  const selected = state[stateKey] as string[];
  const [values, setValues] = useState(selected);
  useEffect(() => setValues(selected), [selected]);
  if (!options.length) return null;
  return (
    <Form action={action} method="get" preventScrollReset>
      <HiddenFilters state={state} extraParams={extraParams} except={stateKey} />
      <Checkboxes
        id={id}
        name={param}
        label={label}
        classModifiers="small"
        options={options.map((option) => ({ ...option, checked: values.includes(option.value) }))}
        onChange={(event) => {
          const next = event.currentTarget.checked
            ? [...values, event.currentTarget.value]
            : values.filter((value) => value !== event.currentTarget.value);
          setValues(next);
          onChange(next);
        }}
      />
      <noscript>
        <Button type="submit">Apply filters</Button>
      </noscript>
    </Form>
  );
}
