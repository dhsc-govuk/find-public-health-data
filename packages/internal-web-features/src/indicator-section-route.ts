import { backLinkHandle } from '@fphd/ui';
import { useActionData, useLoaderData } from 'react-router';

import type { FormValues } from './form-values.ts';
import type { FormFailure } from './indicator-section.ts';
import type { SectionPageProps } from './indicator-section-form.tsx';
import type { ListFocus } from './list-form.ts';
import { indicatorTaskListPath } from './publish-paths.ts';

/** Every section page links back to its draft's task list. */
export const sectionBackLinkHandle = backLinkHandle<{ id: string }>(
  ({ id }) => indicatorTaskListPath(id),
  'Back to task list',
);

/**
 * The draft's answers and their version, and any errors the loader found in them. After a
 * rejected save, it's what was typed, the errors, and the version the action returned (see
 * `versionedAction`). After an Add or a Remove, it also says where focus goes.
 */
export function useSectionForm<
  Field extends string,
  Values = FormValues<Field>,
>(): SectionPageProps<Field, Values> {
  const { values, version, fieldErrors } = useLoaderData<{
    values: Values;
    version: string;
    fieldErrors?: Partial<Record<Field, string>>;
  }>();
  const rejected = useActionData<
    (FormFailure<Field, Values> & { version: string; focus?: ListFocus<string> }) | undefined
  >();

  return {
    fieldErrors: rejected?.fieldErrors ?? fieldErrors ?? {},
    formError: rejected?.formError,
    values: rejected?.values ?? values,
    version: rejected?.version ?? version,
    focus: rejected?.focus,
  };
}
