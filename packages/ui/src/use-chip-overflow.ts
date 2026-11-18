import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { chipOverflow } from './chip-overflow.ts';

export function moreFiltersLabel(count: number) {
  return `Show ${count} more filter${count === 1 ? '' : 's'}`;
}

export function useChipOverflow(children: ReactNode, enabled: boolean) {
  const list = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(0);

  useEffect(() => {
    setReady(enabled && typeof ResizeObserver !== 'undefined');
  }, [enabled]);

  useLayoutEffect(() => {
    const root = list.current;
    const toggle = button.current;
    if (!enabled || !ready || !root || !toggle) return;

    const chips = [...root.children].filter((child): child is HTMLElement =>
      child.classList.contains('fphd-filter-chip'),
    );
    const layout = () => {
      for (const chip of chips) chip.hidden = false;
      toggle.hidden = true;
      const overflow = root.clientWidth
        ? chipOverflow(chips.map((chip) => chip.getBoundingClientRect()))
        : null;
      if (!overflow) {
        setHiddenCount(0);
        return;
      }

      toggle.hidden = false;
      let shown = overflow.shown;
      if (expanded) toggle.textContent = 'Show fewer filters';
      else {
        for (const chip of chips.slice(shown)) chip.hidden = true;
        toggle.textContent = moreFiltersLabel(chips.length - shown);
        // Reserve room for the actual label, whose width changes with the hidden count.
        while (shown > 1 && toggle.getBoundingClientRect().top >= overflow.bottom) {
          chips[--shown]?.setAttribute('hidden', '');
          toggle.textContent = moreFiltersLabel(chips.length - shown);
        }
      }
      setHiddenCount(chips.length - shown);
    };

    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(root);
    window.addEventListener('load', layout);
    return () => {
      observer.disconnect();
      window.removeEventListener('load', layout);
      for (const chip of chips) chip.hidden = false;
    };
  }, [children, enabled, expanded, ready]);

  return {
    list,
    button,
    ready,
    expanded,
    hiddenCount,
    toggle: () => setExpanded((open) => !open),
  };
}
