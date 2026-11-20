import { A, GridColumn, GridRow } from '@fphd/ui';
import { Fragment } from 'react';

import { GUIDANCE_SECTIONS } from './sections.tsx';

export const PUBLISHER_GUIDANCE_TITLE = 'Publisher guidance';

function Contents() {
  return (
    <nav aria-label="Contents" className="fphd-guidance-contents">
      <h2 className="govuk-heading-s">Contents</h2>
      <ul className="govuk-list fphd-guidance-contents__list">
        {GUIDANCE_SECTIONS.map(({ anchor, title, parts = [] }) => (
          <li key={anchor}>
            <A href={`#${anchor}`}>{title}</A>
            {parts.length === 0 ? null : (
              <ul className="govuk-list fphd-guidance-contents__list fphd-guidance-contents__list--parts">
                {parts.map((part) => (
                  <li key={part.anchor}>
                    <A href={`#${part.anchor}`}>{part.title}</A>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** How to write an indicator's answers, which the section pages link to under their headings. */
export function PublisherGuidancePage() {
  return (
    <>
      <h1 className="govuk-heading-xl">{PUBLISHER_GUIDANCE_TITLE}</h1>
      <GridRow className="fphd-guidance">
        <GridColumn width="one-quarter">
          <Contents />
        </GridColumn>
        <GridColumn width="three-quarters">
          {GUIDANCE_SECTIONS.map(({ anchor, title, content = null, parts = [] }) => (
            <Fragment key={anchor}>
              <h2 className="govuk-heading-l" id={anchor}>
                {title}
              </h2>
              {content}
              {parts.map((part) => (
                <Fragment key={part.anchor}>
                  <h3 className="govuk-heading-m" id={part.anchor}>
                    {part.title}
                  </h3>
                  {part.content}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </GridColumn>
      </GridRow>
    </>
  );
}
