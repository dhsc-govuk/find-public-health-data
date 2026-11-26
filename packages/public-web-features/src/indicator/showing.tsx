import type { ReactNode } from 'react';

/**
 * "Showing:" and the chips of what a tab shows, as a group named by that label. A chip's remove
 * link goes with its chip, so the link points at this group by its fragment, and focus moves here
 * once the page shows what is left: the route announcer moves it with JavaScript, and the browser
 * does without. A screen reader then hears "Showing", and the next Tab reaches the first chip
 * left.
 */
export function Showing({ id, children }: { id: string; children: ReactNode }) {
  const labelId = `${id}-label`;

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset groups form controls, and these are links.
    <div
      aria-labelledby={labelId}
      className="fphd-indicator-showing"
      id={id}
      role="group"
      tabIndex={-1}
    >
      <p className="govuk-body-s govuk-!-margin-bottom-1" id={labelId}>
        Showing:
      </p>
      {children}
    </div>
  );
}

/** `url` with the fragment that moves focus to the chips `id` names. */
export function toShowing(url: string, id: string): string {
  return `${url}#${id}`;
}
