import { backLinkHandle } from '@fphd/ui';
import { useActionData, useLoaderData } from 'react-router';

import type { FormValues } from './form-values.ts';
import type { FormFailure } from './indicator-section.ts';
import type { SectionPageProps } from './indicator-section-form.tsx';
import { indicatorTaskListPath } from './publish-paths.ts';

/** Every section page links back to its draft's task list. */
export const sectionBackLinkHandle = backLinkHandle<{ id: string }>(
  ({ id }) => indicatorTaskListPath(id),
  'Back to task list',
);

/**
 * The draft's answers and their version. After a rejected save, it's what was typed, the
 * errors, and the version the action returned (see `versionedAction`).
 */
export function useSectionForm<
  Field extends string,
  Values = FormValues<Field>,
>(): SectionPageProps<Field, Values> {
  const { values, version } = useLoaderData<{ values: Values; version: string }>();
  const rejected = useActionData<(FormFailure<Field, Values> & { version: string }) | undefined>();

  return {
    fieldErrors: rejected?.fieldErrors ?? {},
    formError: rejected?.formError,
    values: rejected?.values ?? values,
    version: rejected?.version ?? version,
  };
}
