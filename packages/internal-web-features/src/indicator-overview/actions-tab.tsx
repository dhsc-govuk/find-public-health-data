import { A, Button } from '@fphd/ui';

import type { ActionsTabSection } from './actions-tab.ts';

/**
 * The Actions tab: each section under its heading, with its button and then its links. With
 * nothing to offer in any of them, the tab says so.
 */
export function ActionsTab({ sections }: { sections: readonly ActionsTabSection[] }) {
  const empty = sections.every(({ button, links }) => button === null && links.length === 0);

  return sections.map(({ heading, button, links }, index) => (
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
      {empty && index === 0 ? (
        <p className="govuk-body">There are no actions available for this indicator yet.</p>
      ) : null}
    </section>
  ));
}
