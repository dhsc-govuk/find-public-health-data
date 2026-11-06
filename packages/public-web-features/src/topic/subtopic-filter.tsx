import { Button, Checkboxes } from '@fphd/ui';
import { Form, useLocation, useNavigate, useNavigation } from 'react-router';
import { HiddenFilters } from '../search/filter-fields.tsx';
import type { SearchState } from '../search/url.ts';

export function TopicSubtopicFilter({
  path,
  state,
  subtopics,
  sort,
  tab = 'data',
}: {
  path: string;
  state: SearchState;
  subtopics: { slug: string; title: string }[];
  sort: string;
  tab?: 'data' | 'areas';
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useNavigation();
  const params = new URLSearchParams(
    navigation.location?.pathname === location.pathname
      ? navigation.location.search
      : location.search,
  );
  const selected = params.getAll('subtopic');
  const extraParams = {
    ...Object.fromEntries(
      [...params].filter(([key]) => key === 'columns-topic' || key === 'render'),
    ),
    'tab-topic': tab,
    sort: params.get('sort') ?? sort,
  };
  if (subtopics.length === 0) return null;
  return (
    <Form
      action={`${path}#${tab === 'areas' ? 'topic-area-summaries' : 'topic-data'}`}
      method="get"
      preventScrollReset
    >
      <HiddenFilters state={state} except="subtopics" extraParams={extraParams} />
      <Checkboxes
        id={`topic-subtopic-${tab}`}
        label="Subtopics"
        classModifiers="small"
        name="subtopic"
        options={subtopics.map(({ slug, title }) => ({
          value: slug,
          label: title,
          checked: selected.includes(slug),
        }))}
        onChange={(event) => {
          const { checked, value } = event.target;
          const next = checked ? [...selected, value] : selected.filter((slug) => slug !== value);
          params.delete('subtopic');
          params.delete('page');
          params.set('tab-topic', tab);
          for (const slug of next) params.append('subtopic', slug);
          void navigate(`${path}?${params}`, {
            preventScrollReset: true,
            flushSync: true,
          });
        }}
      />
      <noscript>
        <Button type="submit">Apply subtopics</Button>
      </noscript>
    </Form>
  );
}
