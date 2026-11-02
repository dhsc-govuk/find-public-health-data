import { useActionData } from 'react-router';

import type { ReviewFormState } from './send.ts';

/** The page's answers and errors: what the loader gave, or what the last refused attempt sent. */
export function useReviewForm<Field extends string, Values>(loaded: {
  values: Values;
  fieldErrors?: Partial<Record<Field, string>>;
}) {
  const rejected = useActionData<ReviewFormState<Field, Values> | undefined>();

  return {
    values: rejected?.values ?? loaded.values,
    fieldErrors: rejected?.fieldErrors ?? loaded.fieldErrors ?? {},
    formError: rejected?.formError,
  };
}
