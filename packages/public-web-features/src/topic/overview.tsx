import { GridColumn, GridRow, SummaryList, Tag } from '@fphd/ui';
import { indicatorPath } from '@fphd/utils/indicator-path';
import { Link } from 'react-router';
import { Sparkline } from '../indicator/charts/sparkline.tsx';
import { formatCalculatedValue } from '../indicator/data.ts';
import { TrendTag } from '../indicator/trend-tag.tsx';
import { searchUrl } from '../search/url.ts';
import { TopicGeographies } from './geographies.tsx';
import type { loadTopicPage } from './loader.ts';

type TopicData = Awaited<ReturnType<typeof loadTopicPage>>;
type Overview = NonNullable<Awaited<TopicData['overview']>>;

export function TopicOverview({
  topic,
  overview,
}: {
  topic: TopicData['topic'];
  overview: Overview;
}) {
  const { search, trends, highlights } = overview;
  return (
    <GridRow className="fphd-topic-overview">
      <GridColumn width="one-quarter">
        <TopicGeographies search={search} path={`/topics/${topic.slug}`} tab="overview" />
      </GridColumn>
      <GridColumn width="three-quarters">
        <p className="govuk-body">{topic.content?.overviewIntro ?? topic.description}</p>
        <h2 className="govuk-heading-m">
          {topic.title} has {trends.total} indicators in total
        </h2>
        <p className="govuk-body">In England, the trend over the last 5 data points is:</p>
        <GridRow className="fphd-topic-trend-counts">
          <GridColumn width="one-half">
            <ul className="govuk-list">
              <li>
                <Tag className="fphd-trend-tag" classModifiers="green">
                  {trends.better} {trends.better === 1 ? 'is' : 'are'} getting better
                </Tag>
              </li>
              <li>
                <Tag className="fphd-trend-tag" classModifiers="red">
                  {trends.worse} {trends.worse === 1 ? 'is' : 'are'} getting worse
                </Tag>
              </li>
              <li>
                <Tag className="fphd-trend-tag" classModifiers="yellow">
                  {trends.unchanged} {trends.unchanged === 1 ? 'shows' : 'show'} no significant
                  change
                </Tag>
              </li>
            </ul>
          </GridColumn>
          <GridColumn width="one-half">
            <ul className="govuk-list">
              <li>
                <Tag className="fphd-trend-tag" classModifiers="grey">
                  {trends.increasing} {trends.increasing === 1 ? 'is' : 'are'} going up (higher is
                  neither better nor worse)
                </Tag>
              </li>
              <li>
                <Tag className="fphd-trend-tag" classModifiers="grey">
                  {trends.decreasing} {trends.decreasing === 1 ? 'is' : 'are'} going down (higher is
                  neither better nor worse)
                </Tag>
              </li>
              <li>
                <Tag className="fphd-trend-tag" classModifiers="grey">
                  {trends.unavailable} cannot have a trend calculated
                </Tag>
              </li>
            </ul>
          </GridColumn>
        </GridRow>
        <p className="govuk-body">
          <Link
            className="govuk-link"
            to={searchUrl(search, `/topics/${topic.slug}`, { 'tab-topic': 'data' })}
          >
            View all {topic.title.toLowerCase()} indicators
          </Link>
        </p>
        <h2 className="govuk-heading-l">Highlighted indicators</h2>
        {topic.content ? (
          <>
            <p className="govuk-body">{topic.content.highlightIntro}</p>
            <ul className="govuk-list govuk-list--bullet">
              {topic.content.highlightPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="fphd-topic-highlight-grid">
          {highlights.map((highlight) => (
            <article className="fphd-topic-highlight" key={highlight.shortId}>
              <h3 className="govuk-heading-s govuk-!-margin-bottom-3">
                <Link className="govuk-link" to={indicatorPath(highlight.slug)}>
                  {highlight.name}
                </Link>
              </h3>
              {highlight.hasTrend ? (
                <Sparkline
                  id={`topic-highlight-chart-${highlight.shortId}`}
                  title={`${highlight.name}, ${highlight.areaName}: trend chart`}
                  indicator={highlight}
                  areaName={highlight.areaName}
                  points={highlight.points}
                />
              ) : (
                <p className="govuk-hint fphd-topic-highlight__no-trend">
                  No trend available
                  <br />
                  (not enough data)
                </p>
              )}
              <SummaryList
                items={[
                  { name: 'Most recent period', children: highlight.period },
                  {
                    name: 'Count',
                    children: highlight.count?.toLocaleString('en-GB') ?? 'No data',
                  },
                  {
                    name: 'Calculated value',
                    children:
                      highlight.value == null ? (
                        'No data'
                      ) : (
                        <>
                          {formatCalculatedValue(highlight.value)}
                          {highlight.unit === '%' ? (
                            '%'
                          ) : highlight.unit ? (
                            <>
                              {' '}
                              <span className="govuk-hint">{highlight.unit}</span>
                            </>
                          ) : null}
                        </>
                      ),
                  },
                  {
                    name: 'Trend (last 5 periods)',
                    children: <TrendTag trend={highlight.trend} />,
                  },
                ]}
              />
            </article>
          ))}
        </div>
      </GridColumn>
    </GridRow>
  );
}
