import { Button, Checkboxes, CollapsibleFilterCard, SearchField } from '@fphd/ui';
import { Form, Link, useLocation, useNavigate, useNavigation } from 'react-router';
import { TOPIC_COLUMNS, topicColumns } from './data.ts';

export function TopicKeywordSearch({ title }: { title: string }) {
  const location = useLocation();
  const navigation = useNavigation();
  const params = new URLSearchParams(
    navigation.location?.pathname === location.pathname
      ? navigation.location.search
      : location.search,
  );
  const cleared = new URLSearchParams(params);
  cleared.delete('q');
  return (
    <Form
      method="get"
      action={`${location.pathname}#topic-data`}
      preventScrollReset
      className="fphd-topic-keyword govuk-!-margin-bottom-6"
    >
      {[...params]
        .filter(([key]) => key !== 'q' && key !== 'page')
        .map(([name, value], index) => (
          <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
        ))}
      <SearchField
        key={params.get('q') ?? ''}
        id="topic-keyword"
        name="q"
        labelSize="m"
        action={
          <Link
            className="govuk-link govuk-body-s govuk-!-margin-bottom-0"
            to={`${location.pathname}?${cleared}`}
            preventScrollReset
          >
            Clear search
          </Link>
        }
        label={`Search ${title.toLowerCase()} indicators`}
        defaultValue={params.get('q') ?? ''}
      />
    </Form>
  );
}

export function TopicTableColumns() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const params = new URLSearchParams(
    navigation.location?.pathname === location.pathname
      ? navigation.location.search
      : location.search,
  );
  const columns = topicColumns(params);
  return (
    <>
      <h2 className="govuk-heading-m">Display options</h2>
      <CollapsibleFilterCard
        active={false}
        variant="accordion"
        headingLevel={3}
        title="Table columns"
      >
        <Form method="get" action={`${location.pathname}#topic-data`} preventScrollReset>
          {[...params]
            .filter(([key]) => key !== 'columns-topic')
            .map(([name, value], index) => (
              <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
            ))}
          <input type="hidden" name="columns-topic" value="none" />
          <Checkboxes
            id="topic-columns"
            name="columns-topic"
            classModifiers="small"
            label={<span className="govuk-visually-hidden">Table columns</span>}
            options={TOPIC_COLUMNS.map((option) => ({
              ...option,
              checked: columns.includes(option.value),
            }))}
            onChange={(event) => {
              const next = TOPIC_COLUMNS.map(({ value }) => value).filter((value) =>
                value === event.currentTarget.value
                  ? event.currentTarget.checked
                  : columns.includes(value),
              );
              params.set('columns-topic', next.join(',') || 'none');
              void navigate(
                { search: `?${params}` },
                { replace: true, preventScrollReset: true, flushSync: true },
              );
            }}
          />
          <noscript>
            <Button type="submit">Apply columns</Button>
          </noscript>
        </Form>
      </CollapsibleFilterCard>
    </>
  );
}
