import { Button, GridColumn, GridRow, Input, Label } from '@fphd/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';

import type { TopicSummary } from './loader.ts';
import { matchingTopics, TopicResults } from './results.tsx';

export function TopicsPage({ topics }: { topics: TopicSummary[] }) {
  const location = useLocation();
  const urlQuery = new URLSearchParams(location.search).get('q') ?? '';
  const [query, setQuery] = useState(urlQuery);
  const initialQuery = useRef(urlQuery);
  const [hydrated, setHydrated] = useState(false);
  const hasHydrated = useRef(false);
  const syncedLocationKey = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const updateQuery = useCallback((value: string) => {
    setQuery(value);
    // Filtering is local to this page. Replacing the browser URL directly keeps every
    // keystroke without starting a loader navigation that can reset a newer input value.
    const next = new URL(window.location.href);
    if (value) next.searchParams.set('q', value);
    else next.searchParams.delete('q');
    window.history.replaceState(window.history.state, '', next);
  }, []);
  useEffect(() => {
    if (syncedLocationKey.current === location.key) return;
    syncedLocationKey.current = location.key;
    // Input's public props do not expose a typed input ref.
    const input = formRef.current?.elements.namedItem('q');
    if (!(input instanceof HTMLInputElement)) return;
    if (!hasHydrated.current) {
      hasHydrated.current = true;
      setHydrated(true);
      if (input.value !== urlQuery) updateQuery(input.value);
    } else {
      // A history navigation can return to this route with an earlier search term.
      setQuery(urlQuery);
      input.value = urlQuery;
    }
  }, [location.key, updateQuery, urlQuery]);
  const filteredTopics = matchingTopics(topics, query);
  const resultCount = topics.length
    ? `${filteredTopics.length} ${filteredTopics.length === 1 ? 'topic' : 'topics'} found.`
    : '';
  const [announcement, setAnnouncement] = useState(resultCount);
  useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(resultCount), 300);
    return () => clearTimeout(timer);
  }, [query, resultCount]);

  return (
    <GridRow className="fphd-topics-page">
      <GridColumn width="full">
        <h1 className="govuk-heading-xl">Public health topics</h1>
        {/* biome-ignore lint/a11y/noRedundantRoles: Explicit landmark supports browsers predating the search element. */}
        <search role="search">
          <form
            ref={formRef}
            action="/topics"
            className="govuk-form-group"
            method="get"
            onSubmit={(event) => event.preventDefault()}
          >
            <Label classModifiers="s" htmlFor="topic-search">
              Search for topics
            </Label>
            <Input
              autoComplete="off"
              classModifiers="width-20"
              defaultValue={initialQuery.current}
              id="topic-search"
              name="q"
              maxLength={200}
              onChange={(event) => updateQuery(event.currentTarget.value)}
              type="search"
            />
            {!hydrated && <Button type="submit">Search</Button>}
          </form>
        </search>
        <p role="status" className="govuk-visually-hidden">
          {announcement}
        </p>
        {filteredTopics.length ? (
          <TopicResults columns="three" headingLevel={2} query={query} topics={filteredTopics} />
        ) : (
          <p className="govuk-body">
            {topics.length ? 'No topics match your search.' : 'No topics are available.'}
          </p>
        )}
      </GridColumn>
    </GridRow>
  );
}
