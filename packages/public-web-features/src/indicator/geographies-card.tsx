import { CollapsibleFilterCard } from '@fphd/ui';
import type { ReactNode } from 'react';
import {
  type AreaTypeNotice,
  ENGLAND_ONLY_MESSAGE,
  OTHER_AREA_TYPES_UNAVAILABLE_MESSAGE,
} from './area-type-notice.ts';

/**
 * The Geographies panel around a tab's area choices. When England is the only geography with data,
 * a message replaces the choices.
 */
export function GeographiesCard({
  children,
  notice,
  onClear,
}: {
  children: ReactNode;
  notice: AreaTypeNotice | undefined;
  onClear?: string | undefined;
}) {
  return (
    <CollapsibleFilterCard active headingLevel={null} title="Geographies" onClear={onClear}>
      {notice === 'england-only' ? <p className="govuk-hint">{ENGLAND_ONLY_MESSAGE}</p> : children}
      {notice === 'others-unavailable' ? (
        <p className="govuk-hint govuk-!-margin-top-2">{OTHER_AREA_TYPES_UNAVAILABLE_MESSAGE}</p>
      ) : null}
    </CollapsibleFilterCard>
  );
}
