import type { ReactNode } from 'react';

/** A labelled region that keyboard users can focus and scroll sideways. */
export function TableScrollRegion({ children, label }: { children: ReactNode; label: string }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region needs focus to scroll by keyboard.
    <section aria-label={label} className="fphd-table-scroll-wrapper" tabIndex={0}>
      {children}
    </section>
  );
}
