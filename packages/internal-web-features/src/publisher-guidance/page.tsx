import { A, GridColumn, GridRow } from '@fphd/ui';
import { Fragment, useEffect, useRef } from 'react';

import { GUIDANCE_SECTIONS } from './sections.tsx';

export const PUBLISHER_GUIDANCE_TITLE = 'Publisher guidance';

// Matches the stylesheet's tablet breakpoint, below which the list is not stuck and shows in full.
const TABLET_AND_UP = '(min-width: 40.0625em)';
// Matches the gap the stylesheet leaves above and below the stuck list.
const WINDOW_GAP = 20;
const MIN_LIST_HEIGHT = 200;

/**
 * Caps the contents list to the space left below it in the window, so it scrolls on its own at
 * any scroll position. The stylesheet's cap only fits once the list has stuck to the top: before
 * that it starts part-way down the window, so the cap is taller than the space it has and its
 * last links run off the bottom without the list being able to scroll to them.
 */
function useFitToWindow<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    const tabletAndUp = window.matchMedia?.(TABLET_AND_UP);
    if (!element || !tabletAndUp) return;

    let frame = 0;
    const fit = () => {
      frame = 0;
      if (!tabletAndUp.matches) {
        element.style.maxHeight = '';
        return;
      }
      const spaceBelow = window.innerHeight - element.getBoundingClientRect().top - WINDOW_GAP;
      const stuckHeight = window.innerHeight - WINDOW_GAP;
      element.style.maxHeight = `${Math.max(MIN_LIST_HEIGHT, Math.min(spaceBelow, stuckHeight))}px`;
    };
    const queueFit = () => {
      if (!frame) frame = window.requestAnimationFrame(fit);
    };

    fit();
    window.addEventListener('scroll', queueFit, { passive: true });
    window.addEventListener('resize', queueFit);
    return () => {
      window.removeEventListener('scroll', queueFit);
      window.removeEventListener('resize', queueFit);
      if (frame) window.cancelAnimationFrame(frame);
      element.style.maxHeight = '';
    };
  }, []);

  return ref;
}

function Contents() {
  const ref = useFitToWindow<HTMLElement>();

  return (
    <nav aria-label="Contents" className="fphd-guidance-contents" ref={ref}>
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
