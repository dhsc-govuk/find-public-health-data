import { Button, GeographyTree } from '@fphd/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { Form } from 'react-router';
import { MAX_SELECTED_AREAS } from '../selection-limits.ts';
import type { GeographyOptions } from './loader.ts';

interface GeographySelection {
  areaCodes: string[];
  areaLevels: string[];
}

export function GeographyPicker({
  action,
  children,
  displayGroups,
  geographyOptions,
  levelName,
  name,
  onApply,
  replace = false,
  selection,
  lookupUrl,
  searchLabel,
  searchHint,
  single = false,
}: {
  action: string;
  children: ReactNode;
  displayGroups: string[];
  geographyOptions?: GeographyOptions | undefined;
  levelName: string;
  name: string;
  onApply: (selection: GeographySelection) => void;
  replace?: boolean;
  selection: GeographySelection;
  lookupUrl?: string | undefined;
  searchLabel?: string | undefined;
  searchHint?: string | undefined;
  single?: boolean;
}) {
  const [pending, setPending] = useState(selection);
  const { areaCodes, areaLevels } = selection;
  useEffect(() => setPending({ areaCodes, areaLevels }), [areaCodes, areaLevels]);

  return (
    <Form action={action} method="get" replace={replace} preventScrollReset>
      {children}
      <GeographyTree
        single={single}
        lookupUrl={lookupUrl}
        searchLabel={searchLabel}
        searchHint={searchHint}
        groupAsOne
        showLimitHint={false}
        fallback={geographyOptions}
        levelName={levelName}
        levels={displayGroups}
        maxAreaTicks={MAX_SELECTED_AREAS}
        name={name}
        onChange={(areaCodes) => {
          const next = { ...pending, areaCodes, ...(single ? { areaLevels: [] } : {}) };
          setPending(next);
          onApply(next);
        }}
        onLevelsChange={(areaLevels) => {
          const next = { ...pending, areaLevels };
          setPending(next);
          onApply(next);
        }}
        selected={pending.areaCodes}
        selectedLevels={pending.areaLevels}
      />
      <noscript>
        <Button type="submit">Apply geographies</Button>
      </noscript>
    </Form>
  );
}
