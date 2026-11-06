import { Button, CollapsibleFilterCard, Select, TextInput } from '@fphd/ui';
import { Form } from 'react-router';
import { HiddenFilters } from './filter-fields.tsx';
import { type SearchState, searchUrl } from './url.ts';

export function SearchPeriodFilter({
  state,
  action,
  extraParams,
}: {
  state: SearchState;
  action: string;
  extraParams: Record<string, string>;
}) {
  return (
    <>
      <CollapsibleFilterCard
        headingLevel={3}
        active={Boolean(state.fromYear || state.toYear)}
        title="Years the data covers"
        onClear={searchUrl({ ...state, fromYear: '', toYear: '' }, action, extraParams)}
      >
        <Form
          action={action}
          method="get"
          preventScrollReset
          onBlur={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              event.currentTarget.contains(event.relatedTarget)
            )
              return;
            if (event.currentTarget.reportValidity()) event.currentTarget.requestSubmit();
          }}
        >
          <HiddenFilters state={state} extraParams={extraParams} except={['fromYear', 'toYear']} />
          <TextInput
            id="topic-from-year"
            name="fromYear"
            label="From"
            hint="For example, 2010"
            inputMode="numeric"
            pattern="[12][0-9]{3}"
            maxLength={4}
            className="govuk-input--width-4"
            defaultValue={state.fromYear ?? ''}
          />
          <TextInput
            id="topic-to-year"
            name="toYear"
            label="To"
            hint="For example, 2023"
            inputMode="numeric"
            pattern="[12][0-9]{3}"
            maxLength={4}
            className="govuk-input--width-4"
            defaultValue={state.toYear ?? ''}
          />
          <noscript>
            <Button type="submit">Apply years</Button>
          </noscript>
        </Form>
      </CollapsibleFilterCard>
      <CollapsibleFilterCard
        headingLevel={3}
        active={Boolean(state.updatedWithin)}
        title="Last updated"
        onClear={searchUrl({ ...state, updatedWithin: '' }, action, extraParams)}
      >
        <Form action={action} method="get" preventScrollReset>
          <HiddenFilters state={state} extraParams={extraParams} except="updatedWithin" />
          <Select
            id="topic-updated-within"
            name="updatedWithin"
            label={<span className="govuk-visually-hidden">Last updated</span>}
            hint="Show indicators with a new data period published recently"
            defaultValue={state.updatedWithin ?? ''}
            options={[
              { value: '', label: 'Any time' },
              { value: '3', label: 'In the last 3 months' },
              { value: '6', label: 'In the last 6 months' },
              { value: '12', label: 'In the last 12 months' },
            ]}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />
          <noscript>
            <Button type="submit">Apply last updated</Button>
          </noscript>
        </Form>
      </CollapsibleFilterCard>
    </>
  );
}
