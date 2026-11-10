import 'accessible-autocomplete/dist/accessible-autocomplete.min.css';

import FormGroup from '@not-govuk/form-group';
import {
  type ChangeEventHandler,
  type ElementType,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';

import { type AutocompleteOption, escapeHtml, isOption, labelOf } from './autocomplete.tsx';
import { fieldInputId } from './error-summary.tsx';

interface SelectAutocompleteProps {
  name: string;
  label: ReactNode;
  labelHeading?: ElementType | undefined;
  error?: ReactNode;
  /** An option whose value is empty is the select's prompt, which the autocomplete leaves out. */
  options: readonly AutocompleteOption[];
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
  /**
   * Called with an option's value when the user picks it from the suggestions, by a click or
   * by Enter or Space on a highlighted one. Typing an option's name in full sets the select
   * without calling this, because the user may still be typing a longer name. A field given
   * this does not take the highlighted suggestion when the user leaves it or presses Escape,
   * so that moving through the suggestions is never a pick.
   */
  onPick?: (value: string) => void;
}

/**
 * A GOV.UK select that becomes type-to-search in the browser. The server renders the select,
 * which is the whole control without JavaScript; on mount accessible-autocomplete puts its
 * input in front, taking the select's id so the label and error summary link reach it, and the
 * select is hidden but still submits the choice. A choice in the input is set on the select
 * with a change event, so `onChange` hears it as it would from the select itself. `onPick`
 * hears only a choice made from the suggestions, for a page that acts on the choice at once.
 */
export function SelectAutocomplete({
  name,
  label,
  labelHeading,
  error,
  options,
  defaultValue,
  onChange,
  onPick,
}: SelectAutocompleteProps) {
  const fieldId = fieldInputId(name);
  const errorId = `${name}-error`;
  const containerRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  // Kept current so the mount-once effect never holds stale props.
  const latestOptions = useRef(options);
  latestOptions.current = options;
  const latestOnPick = useRef(onPick);
  latestOnPick.current = onPick;

  useEffect(() => {
    const container = containerRef.current;
    const select = selectRef.current;
    if (!container || !select) {
      return;
    }
    let unmounted = false;
    const choices = () => latestOptions.current.filter(({ value }) => value !== '');
    const choose = (value: string) => {
      if (select.value === value) return;
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
    // Typing away from the confirmed choice unsets it, so the select never submits a choice the
    // input no longer shows; typing a choice's name exactly sets it.
    const onInput = (event: Event) => {
      const text = (event.target as HTMLInputElement).value.trim().toLowerCase();
      choose(choices().find((option) => option.label.toLowerCase() === text)?.value ?? '');
    };
    container.addEventListener('input', onInput);

    void import('accessible-autocomplete').then(({ default: accessibleAutocomplete }) => {
      if (unmounted) {
        return;
      }
      // A choice made before hydration is in the select, not the props.
      const initial = choices().find(({ value }) => value === select.value);
      // The select gives up its id in the same task the input takes it.
      flushSync(() => setEnhanced(true));

      accessibleAutocomplete<AutocompleteOption>({
        element: container,
        id: fieldId,
        defaultValue: initial?.label ?? '',
        minLength: 1,
        showAllValues: true,
        // The library confirms the highlighted suggestion on blur and on Escape unless told not to.
        confirmOnBlur: latestOnPick.current === undefined,
        source: (query, populateResults) => {
          const q = query.trim().toLowerCase();
          populateResults(choices().filter((option) => option.label.toLowerCase().includes(q)));
        },
        templates: {
          suggestion: (option) => escapeHtml(labelOf(option)),
          inputValue: (option) => labelOf(option),
        },
        onConfirm: (option) => {
          if (!isOption(option)) return;
          choose(option.value);
          latestOnPick.current?.(option.value);
        },
      });
    });

    return () => {
      unmounted = true;
      container.removeEventListener('input', onInput);
      container.innerHTML = '';
    };
  }, [fieldId]);

  return (
    <FormGroup
      className="fphd-autocomplete"
      error={error}
      errorId={errorId}
      fieldId={fieldId}
      id={name}
      label={label}
      labelHeading={labelHeading}
    >
      <div ref={containerRef} />
      <select
        aria-describedby={error ? errorId : undefined}
        className={[
          'govuk-select',
          error ? 'govuk-select--error' : '',
          enhanced ? 'govuk-!-display-none' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        defaultValue={defaultValue}
        id={enhanced ? `${fieldId}-select` : fieldId}
        name={name}
        onChange={onChange}
        ref={selectRef}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormGroup>
  );
}
