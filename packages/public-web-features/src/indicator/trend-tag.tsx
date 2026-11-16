import { Tag } from '@fphd/ui';
import type { RecentTrend } from './data.ts';

export function TrendTag({ trend }: { trend: RecentTrend }) {
  if (trend.direction === null)
    return (
      <span className="govuk-hint govuk-!-margin-bottom-0">
        {trend.label} <br />(<span className="fphd-trend-reason">{trend.reason}</span>)
      </span>
    );
  return (
    <Tag classModifiers={trend.tone} className="fphd-trend-tag">
      {trend.direction ? (
        <span
          aria-hidden="true"
          className={`fphd-trend-tag__arrow fphd-trend-tag__arrow--${trend.direction}`}
        />
      ) : null}
      <span className="fphd-trend-tag__text">{trend.label}</span>
    </Tag>
  );
}
