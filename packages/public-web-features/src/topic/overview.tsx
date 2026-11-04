import { ChartSection, GridColumn, GridRow, SummaryList, Tag } from '@fphd/ui';
import { indicatorPath } from '@fphd/utils/indicator-path';
import { Link } from 'react-router';
import {
  availableMeasures,
  comparisonRows,
  formatCalculatedValue,
  MEASURES,
  recentTrend,
  withUnit,
} from '../indicator/data.ts';
import type { IndicatorObservation } from '../indicator/loader.ts';
import { TrendTag } from '../indicator/trend-tag.tsx';
import { searchUrl } from '../search/url.ts';
import { TopicGeographies } from './geographies.tsx';
import type { loadTopicPage } from './loader.ts';

type TopicData = Awaited<ReturnType<typeof loadTopicPage>>;
type Overview = NonNullable<Awaited<TopicData['overview']>>;

/** A row for each raw number the series has, or a Count row saying there is no data. */
function measureItems(series: IndicatorObservation[], latest: IndicatorObservation | undefined) {
  const available = availableMeasures(series);
  const shown = MEASURES.filter(({ key }) => available.includes(key));
  return (shown.length > 0 ? shown : MEASURES.slice(0, 1)).map(({ key, label }) => ({
    name: label,
    children: latest?.[key] == null ? 'No data' : latest[key].toLocaleString(),
  }));
}

export function TopicOverview({
  topic,
  overview,
}: {
  topic: TopicData['topic'];
  overview: Overview;
}) {
  const { search, trends, selected } = overview;
  const rows = comparisonRows(selected);
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
          {selected.map((entry) => {
            const row = rows.find(({ shortId }) => shortId === entry.detail.shortId);
            const area =
              entry.areaData.find(({ areaCode }) => areaCode !== 'E92000001') ?? entry.areaData[0];
            const cell = row?.cells.find(({ areaCode }) => areaCode === area?.areaCode);
            const latest = cell?.series.at(-1);
            const trend = recentTrend(cell?.series ?? [], entry.detail.polarity);
            return (
              <article className="fphd-topic-highlight" key={entry.detail.shortId}>
                <h3 className="govuk-heading-s govuk-!-margin-bottom-3">
                  <Link className="govuk-link" to={indicatorPath(entry.detail.slug)}>
                    {entry.detail.name}
                  </Link>
                </h3>
                {(cell?.series.filter(({ value }) => value !== null).length ?? 0) >= 2 ? (
                  <ChartSection
                    id={`topic-highlight-chart-${entry.detail.shortId}`}
                    title={`${entry.detail.name}, ${area?.areaName ?? 'England'}: trend chart`}
                    description={`How this indicator has changed over time in ${area?.areaName ?? 'England'}.`}
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
                    { name: 'Most recent period', children: row?.period || 'No data' },
                    ...measureItems(cell?.series ?? [], latest),
                    {
                      name: 'Calculated value',
                      children:
                        latest?.value == null
                          ? 'No data'
                          : withUnit(formatCalculatedValue(latest.value), entry.detail.unit),
                    },
                    { name: 'Trend (last 5 periods)', children: <TrendTag trend={trend} /> },
                  ]}
                />
              </article>
            );
          })}
        </div>
      </GridColumn>
    </GridRow>
  );
}
