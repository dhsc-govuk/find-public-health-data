import { GridColumn, GridRow, Tabs } from '@fphd/ui';
import { Link, useLocation } from 'react-router';
import { DataSection, useDataReady } from '../data-section.tsx';
import { SearchFilterPane } from '../search/filter-pane.tsx';
import { topicDisplayParams } from './filters.ts';
import { TopicGeographies } from './geographies.tsx';
import { TopicListing } from './listing.tsx';
import type { loadTopicPage } from './loader.ts';
import { TopicKeywordSearch, TopicTableColumns } from './options.tsx';
import { TopicOverview } from './overview.tsx';
import { TopicSubtopicFilter } from './subtopic-filter.tsx';

type TopicData = Awaited<ReturnType<typeof loadTopicPage>>;

export function TopicPage(data: TopicData) {
  const { topic, content, overview, areas } = data;
  const contentReady = useDataReady([overview, content, areas]);
  const location = useLocation();
  const path = `/topics/${topic.slug}`;
  const displayParams = topicDisplayParams(new URLSearchParams(location.search));
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
        contentReady={contentReady}
        sectionHeadings
        history="push"
        paramKey="tab-topic"
        title={`${topic.title} contents`}
        items={[
          {
            id: 'topic-overview',
            param: 'overview',
            label: 'Overview',
            content: (
              <DataSection label="overview" resolve={overview}>
                {(overview) =>
                  overview ? (
                    <TopicOverview topic={topic} overview={overview} />
                  ) : (
                    <p className="govuk-body">{topic.description}</p>
                  )
                }
              </DataSection>
            ),
          },
          {
            id: 'topic-data',
            param: 'data',
            label: 'Data',
            content: (
              <DataSection label="data" resolve={content}>
                {(content) =>
                  content ? (
                    <GridRow className="fphd-topic-data">
                      <GridColumn width="one-quarter">
                        <TopicKeywordSearch title={topic.title} />
                        <TopicGeographies search={content.search} path={path} tab="data" />
                        <SearchFilterPane
                          action={path}
                          formAction={`${path}#topic-data`}
                          extraParams={{
                            ...displayParams,
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
                        <TopicListing data={{ topic, ...content }} />
                      </GridColumn>
                    </GridRow>
                  ) : null
                }
              </DataSection>
            ),
          },
          {
            id: 'topic-area-summaries',
            param: 'areas',
            label: 'Area summaries',
            content: (
              <DataSection label="area summaries" resolve={areas}>
                {(areas) =>
                  areas ? (
                    <GridRow>
                      <GridColumn width="one-quarter">
                        <TopicGeographies search={areas.search} path={path} tab="areas" />
                        <SearchFilterPane
                          action={path}
                          formAction={`${path}#topic-area-summaries`}
                          extraParams={{
                            ...displayParams,
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
                        <TopicListing data={{ topic, ...areas }} areas />
                      </GridColumn>
                    </GridRow>
                  ) : null
                }
              </DataSection>
            ),
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
