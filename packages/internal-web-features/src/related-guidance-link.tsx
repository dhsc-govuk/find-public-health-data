import { A } from '@fphd/ui';

import { type GuidanceAnchor, publisherGuidancePath } from './publisher-guidance/paths.ts';

/**
 * A section page's link to its part of the publisher guidance. It opens in a new tab, and says
 * so, so a publisher who follows it keeps the answers they have not saved yet.
 */
export function RelatedGuidanceLink({ anchor }: { anchor: GuidanceAnchor }) {
  return (
    <p className="govuk-body">
      <A href={publisherGuidancePath(anchor)} rel="noreferrer noopener" target="_blank">
        Related guidance for this section (opens in new tab)
      </A>
    </p>
  );
}
