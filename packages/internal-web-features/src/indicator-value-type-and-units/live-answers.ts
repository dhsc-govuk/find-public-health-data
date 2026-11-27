import { type FormEvent, useEffect, useRef, useState } from 'react';

import { type FormValues, readFormValues } from '../form-values.ts';

/** The answers in the form around `element`, or undefined when it is in none. */
function answersAround<Field extends string>(
  element: HTMLElement | null,
  fields: readonly Field[],
): FormValues<Field> | undefined {
  const form = element?.closest('form');
  return form ? readFormValues(new FormData(form), fields) : undefined;
}

/**
 * The answers as the form holds them now, for a page whose questions follow from earlier answers.
 * Nothing can show or hide without JavaScript, so until the page is hydrated these are the answers
 * it was rendered with, and every follow-up shows with a hint naming the answer it is for. After,
 * they follow every change, and only the follow-ups the answers ask for show.
 *
 * Put `onChange` and `ref` on an element inside the form that holds every question.
 */
export function useLiveAnswers<Field extends string>(
  fields: readonly Field[],
  initial: FormValues<Field>,
) {
  const [values, setValues] = useState(initial);
  const [enhanced, setEnhanced] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const read = () => setValues((current) => answersAround(ref.current, fields) ?? current);

  useEffect(() => {
    // An answer given before hydration is in the form but not yet in state.
    setValues((current) => answersAround(ref.current, fields) ?? current);
    setEnhanced(true);
  }, [fields]);

  return {
    values,
    enhanced,
    ref,
    onChange: (_event: FormEvent) => read(),
    /** A follow-up's hint naming the answer it is for, shown only before hydration. */
    hint: (text: string): { hint?: string } => (enhanced ? {} : { hint: text }),
    /** Whether to hide a follow-up: once hydrated, unless the answers ask for it. */
    hides: (shown: boolean) => enhanced && !shown,
  };
}
