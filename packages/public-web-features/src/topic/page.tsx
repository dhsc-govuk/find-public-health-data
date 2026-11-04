import { GridColumn, GridRow, Tabs } from '@fphd/ui';
import { Link, useLocation } from 'react-router';
import { SearchFilterPane } from '../search/filter-pane.tsx';
import { TopicGeographies } from './geographies.tsx';
import { TopicListing } from './listing.tsx';
import type { loadTopicPage } from './loader.ts';
import { TopicKeywordSearch, TopicTableColumns } from './options.tsx';
import { TopicOverview } from './overview.tsx';
import { TopicSubtopicFilter } from './subtopic-filter.tsx';

type TopicData = Awaited<ReturnType<typeof loadTopicPage>>;

export function TopicPage(data: TopicData) {
  const { topic, content, overview, areas } = data;
  const location = useLocation();
  const tableData = content ? { topic, ...content } : null;
  const areaData = areas ? { topic, ...areas } : null;
  const path = `/topics/${topic.slug}`;
  const columnParams = Object.fromEntries(
    [...new URLSearchParams(location.search)].filter(([key]) => key === 'columns-topic'),
  );
  return (
    <div className="fphd-wide-layout fphd-topic-page">
      <nav aria-label="Breadcrumb" className="govuk-breadcrumbs">
        <ol className="govuk-breadcrumbs__list">
          <li className="govuk-breadcrumbs__list-item">
            <Link className="govuk-breadcrumbs__link" to="/">
              Home
            </Link>
          </li>
          <li className="govuk-breadcrumbs__list-item">
            <Link className="govuk-breadcrumbs__link" to="/topics">
              Topics
            </Link>
          </li>
        </ol>
      </nav>
      <h1 className="govuk-heading-xl">{topic.title}</h1>
      <Tabs
        sectionHeadings
        history="push"
        paramKey="tab-topic"
        title={`${topic.title} contents`}
        items={[
          {
            id: 'topic-overview',
            param: 'overview',
            label: 'Overview',
            content: overview ? (
              <TopicOverview topic={topic} overview={overview} />
            ) : (
              <p className="govuk-body">{topic.description}</p>
            ),
          },
          {
            id: 'topic-data',
            param: 'data',
            label: 'Data',
            content:
              content && tableData ? (
                <GridRow className="fphd-topic-data">
                  <GridColumn width="one-quarter">
                    <TopicKeywordSearch title={topic.title} />
                    <TopicGeographies search={content.search} path={path} tab="data" />
                    <SearchFilterPane
                      action={path}
                      formAction={`${path}#topic-data`}
                      extraParams={{
                        ...columnParams,
                        'tab-topic': 'data',
                        sort: content.listing.sort,
                      }}
                      includeTopics={false}
                      includeDataPeriod
                      facets={content.search.facets}
                      state={content.search}
                      subtopicFilter={
                        <TopicSubtopicFilter
                          path={path}
                          state={content.search}
                          subtopics={topic.subtopics ?? []}
                          sort={content.listing.sort}
                        />
                      }
                    />
                    <TopicTableColumns />
                  </GridColumn>
                  <GridColumn width="three-quarters">
                    <TopicListing data={tableData} />
                  </GridColumn>
                </GridRow>
              ) : null,
          },
          {
            id: 'topic-area-summaries',
            param: 'areas',
            label: 'Area summaries',
            content:
              areas && areaData ? (
                <GridRow>
                  <GridColumn width="one-quarter">
                    <TopicGeographies search={areas.search} path={path} tab="areas" />
                    <SearchFilterPane
                      action={path}
                      formAction={`${path}#topic-area-summaries`}
                      extraParams={{
                        ...columnParams,
                        'tab-topic': 'areas',
                        sort: areas.listing.sort,
                      }}
                      includeTopics={false}
                      compact
                      facets={areas.search.facets}
                      state={areas.search}
                      subtopicFilter={
                        <TopicSubtopicFilter
                          path={path}
                          state={areas.search}
                          subtopics={topic.subtopics ?? []}
                          sort={areas.listing.sort}
                          tab="areas"
                        />
                      }
                    />
                  </GridColumn>
                  <GridColumn width="three-quarters">
                    <TopicListing data={areaData} areas />
                  </GridColumn>
                </GridRow>
              ) : null,
          },
          {
            id: 'topic-publications',
            param: 'publications',
            label: 'More information',
            content: topic.content ? (
              <div className="fphd-topic-more-information">
                <p className="govuk-body">{topic.content.moreInformation.intro}</p>
                {topic.content.moreInformation.sections.map((section) => (
                  <section key={section.heading}>
                    <h2 className="govuk-heading-m">{section.heading}</h2>
                    <ul className="govuk-list govuk-list--bullet">
                      {section.links.map(({ label, url, note }) => (
                        <li key={url}>
                          <a className="govuk-link" href={url}>
                            {label}
                          </a>
                          {note ? ` (${note})` : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <p className="govuk-body">No further information is available for this topic.</p>
            ),
          },
        ]}
      />
    </div>
  );
}
