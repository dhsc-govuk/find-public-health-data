import { A, Button } from '@fphd/ui';
import type { ReactNode } from 'react';

import type { ActionsTabSection } from './actions-tab-sections.ts';

interface ActionsTabProps {
  sections: readonly ActionsTabSection[];
  /** The reviewer's own notes and their form, in the Review section, for an assigned reviewer. */
  reviewerNotes?: ReactNode;
  /**
   * Other reviewers' notes, read only: after the reviewer's own in the Review section, or in a
   * section of their own for a reader who is not reviewing.
   */
  otherReviewerNotes?: ReactNode;
}

/**
 * The Actions tab: each section under its heading, with its button and then its links. With
 * nothing to offer in any of them, the tab says so.
 */
export function ActionsTab({
  sections,
  reviewerNotes = null,
  otherReviewerNotes = null,
}: ActionsTabProps) {
  const reviewing = sections.some(({ heading }) => heading === 'Review');
  const notes = reviewing ? reviewerNotes : null;
  const empty =
    notes === null && sections.every(({ button, links }) => button === null && links.length === 0);

  return (
    <>
      {sections.map(({ heading, button, links }, index) => (
        <section key={heading}>
          <h2 className="govuk-heading-m">{heading}</h2>
          {button === null ? null : <Button href={button.href}>{button.label}</Button>}
          {links.length === 0 ? null : (
            <ul className="govuk-list">
              {links.map(({ href, label }) => (
                <li key={href}>
                  <A href={href}>{label}</A>
                </li>
              ))}
            </ul>
          )}
          {heading === 'Review' ? (
            <>
              {notes}
              {otherReviewerNotes}
            </>
          ) : null}
          {empty && index === 0 ? (
            <p className="govuk-body">There are no actions available for this indicator yet.</p>
          ) : null}
        </section>
      ))}
      {reviewing || otherReviewerNotes === null ? null : (
        <section>
          <h2 className="govuk-heading-m govuk-!-margin-top-4">Reviewers' notes</h2>
          {otherReviewerNotes}
        </section>
      )}
    </>
  );
}
