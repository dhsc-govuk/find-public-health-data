import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { attachStickyTable } from './sticky-table.ts';

/**
 * A wide table's sideways scroll, reachable from the keyboard: the wrapper is a labelled,
 * focusable region, the pattern ChartSection uses, so the arrow keys can move it. Once the
 * page has loaded, a scrollbar above the table and a copy of its head stay in view while
 * the page scrolls past it. Cells marked `fphd-table__frozen` stay at its left edge.
 */
export function TableScrollRegion({ children, label }: { children: ReactNode; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  const captionCopy = useRef<HTMLParagraphElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const [barContainer, setBarContainer] = useState<HTMLDivElement>();
  const bar = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLElement>(null);
  const leftEdge = useRef<HTMLDivElement>(null);
  const rightEdge = useRef<HTMLDivElement>(null);
  const sticky = useRef<ReturnType<typeof attachStickyTable>>(undefined);

  useEffect(() => {
    setBarContainer(document.createElement('div'));
  }, []);

  useEffect(() => {
    if (
      !root.current ||
      !captionCopy.current ||
      !slot.current ||
      !barContainer ||
      !bar.current ||
      !thumb.current ||
      !scroller.current ||
      !leftEdge.current ||
      !rightEdge.current ||
      typeof ResizeObserver === 'undefined'
    ) {
      return;
    }
    slot.current.append(barContainer);
    root.current.classList.add('fphd-table-scroll--enhanced');
    sticky.current = attachStickyTable({
      root: root.current,
      captionCopy: captionCopy.current,
      barContainer,
      bar: bar.current,
      thumb: thumb.current,
      scroller: scroller.current,
      leftEdge: leftEdge.current,
      rightEdge: rightEdge.current,
    });
    return () => {
      sticky.current?.detach();
      sticky.current = undefined;
      barContainer.remove();
    };
  }, [barContainer]);

  // A re-rendered table can change width or head, so every render rechecks the layout.
  useEffect(() => {
    sticky.current?.refresh();
  });

  return (
    <div className="fphd-table-scroll" ref={root}>
      <p aria-hidden="true" className="fphd-table-caption-copy" hidden ref={captionCopy} />
      <div className="fphd-table-scrollbar-slot" ref={slot} />
      {barContainer &&
        createPortal(
          <div aria-hidden="true" className="fphd-table-scrollbar" ref={bar}>
            <div className="fphd-table-scrollbar__thumb" ref={thumb} />
          </div>,
          barContainer,
        )}
      <div className="fphd-table-scroll__frame">
        <section
          aria-label={label}
          className="fphd-table-scroll-wrapper"
          ref={scroller}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region needs focus to scroll by keyboard.
          tabIndex={0}
        >
          {children}
        </section>
        <div aria-hidden="true" className="fphd-table-edge fphd-table-edge--left" ref={leftEdge} />
        <div
          aria-hidden="true"
          className="fphd-table-edge fphd-table-edge--right"
          ref={rightEdge}
        />
      </div>
    </div>
  );
}
