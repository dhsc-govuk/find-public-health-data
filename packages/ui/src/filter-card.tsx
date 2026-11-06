import Hint from '@not-govuk/hint';
import type { ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';

export function CollapsibleFilterCard({
  children,
  footer,
  hint,
  active,
  onClear,
  title,
  headingLevel = 3,
}: {
  children?: ReactNode;
  footer?: ReactNode | undefined;
  hint?: string | undefined;
  active: boolean;
  onClear?: string | undefined;
  title: string;
  headingLevel?: 2 | 3;
}) {
  const bodyId = useId();
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const [open, setOpen] = useState(active);
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return (
    <div className="fphd-filter-card">
      <Heading
        aria-label={title}
        className="fphd-filter-card__header govuk-body govuk-!-font-weight-bold govuk-!-margin-bottom-0"
      >
        <span>{title}</span>
        <button
          aria-controls={bodyId}
          aria-expanded={open}
          aria-label={title}
          className="fphd-filter-card__toggle"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          <svg
            className="fphd-filter-card__chevron"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m5 9 7 7 7-7" fill="none" stroke="currentColor" strokeWidth="2.5" />
          </svg>
          {title}
        </button>
      </Heading>
      {/* Always in the HTML: CSS reveals it without JavaScript, JS toggles hidden. */}
      <div className="fphd-filter-card__body fphd-collapsible-body" hidden={!open} id={bodyId}>
        {hint ? <Hint className="govuk-body-s govuk-!-margin-bottom-3">{hint}</Hint> : null}
        {onClear ? (
          <Link
            className="govuk-link govuk-body-s govuk-!-display-block govuk-!-margin-bottom-4"
            preventScrollReset
            replace
            to={onClear}
          >
            Clear filter
          </Link>
        ) : null}
        {children}
      </div>
      {footer ? (
        <div className="fphd-filter-card__footer fphd-collapsible-body" hidden={!open}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A selected value. Without `onRemove` the chip is fixed — the default area cannot be
 * removed since that would leave nothing to compare against.
 */
export function FilterChip({
  children,
  onRemove,
  removeLabel,
  value,
  replace = false,
}: {
  children: ReactNode;
  onRemove?: string | undefined;
  removeLabel?: string | undefined;
  value: string;
  replace?: boolean;
}) {
  return (
    <div className="fphd-filter-chip" data-value={value}>
      {onRemove ? (
        <Link
          aria-label={`Remove ${removeLabel} filter`}
          className="fphd-filter-chip__remove govuk-link govuk-link--no-visited-state govuk-link--no-underline govuk-!-font-size-16 govuk-!-font-weight-bold"
          preventScrollReset
          replace={replace}
          to={onRemove}
        >
          ×
        </Link>
      ) : null}
      <span>{children}</span>
    </div>
  );
}

export function FilterChips({
  children,
  className = 'govuk-!-margin-bottom-2',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`fphd-filter-chips fphd-filter-chips--inline ${className}`}>{children}</div>
  );
}
