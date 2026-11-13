/** The gap kept between the top of the window and a pinned scrollbar. */
export const STICKY_GAP = 6;

/** The custom scrollbar's thumb: never narrower than 30px, placed in proportion to the scroll. */
export function thumbGeometry({
  trackWidth,
  clientWidth,
  scrollWidth,
  scrollLeft,
}: {
  trackWidth: number;
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
}) {
  const maxScroll = scrollWidth - clientWidth;
  const width = Math.max(30, (trackWidth * clientWidth) / scrollWidth);
  const left = maxScroll > 0 ? (scrollLeft / maxScroll) * (trackWidth - width) : 0;
  return { width, left, maxScroll };
}

/**
 * Whether the header is pinned: its row has scrolled above `above` (the space the pinned
 * scrollbar takes) while body rows are still on screen beneath it.
 */
export function headerPinned({
  headTop,
  headHeight,
  tableBottom,
  above,
}: {
  headTop: number;
  headHeight: number;
  tableBottom: number;
  above: number;
}) {
  return headTop < above && tableBottom > headHeight + above;
}

interface StickyTableElements {
  root: HTMLElement;
  captionCopy: HTMLElement;
  bar: HTMLElement;
  thumb: HTMLElement;
  scroller: HTMLElement;
  leftEdge: HTMLElement;
  rightEdge: HTMLElement;
}

const FROZEN = '.fphd-table__frozen';

const COPIED_STYLES = [
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'padding',
  'text-align',
  'vertical-align',
  'white-space',
];

/** A copy of the table's head, without the ids and `headers` that belong to the real one. */
function copyHead(table: HTMLTableElement): HTMLTableElement {
  const copy = document.createElement('table');
  copy.className = table.className;
  const head = table.tHead?.cloneNode(true) as HTMLTableSectionElement;
  for (const element of head.querySelectorAll('[id], [headers]')) {
    element.removeAttribute('id');
    element.removeAttribute('headers');
  }
  copy.append(document.createElement('colgroup'), head);
  return copy;
}

// A table in a closed details element still has a layout box, which only checkVisibility sees.
const shown = (element: HTMLElement) =>
  typeof element.checkVisibility === 'function'
    ? element.checkVisibility()
    : element.offsetParent !== null;

/** The caption's visible words, without the parts written for screen readers alone. */
function visibleCaption(caption: HTMLTableCaptionElement): string {
  const copy = caption.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('.govuk-visually-hidden')) hidden.remove();
  return copy.textContent?.trim() ?? '';
}

/**
 * Keeps a wide table usable while it scrolls: a scrollbar above it that pins under the top of
 * the window, a copy of its head pinned above the rows, its frozen columns' offset, and
 * shadows at whichever side has columns out of view. Returns a cleanup function.
 */
export function attachStickyTable({
  root,
  captionCopy,
  bar,
  thumb,
  scroller,
  leftEdge,
  rightEdge,
}: StickyTableElements): { refresh: () => void; detach: () => void } {
  const header = document.createElement('div');
  header.className = 'fphd-sticky-header';
  header.setAttribute('aria-hidden', 'true');
  // On the body, because a transformed ancestor would otherwise become the fixed box's frame.
  document.body.append(header);
  let copy: HTMLTableElement | undefined;
  let copiedHead = '';
  let frame = 0;

  const table = () => scroller.querySelector('table');
  const slot = bar.parentElement;

  const pinBar = (top: number, left: number, width: number) => {
    // Moved to the body for the same reason as the header copy.
    if (bar.parentElement !== document.body) document.body.append(bar);
    bar.classList.add('fphd-table-scrollbar--floating');
    Object.assign(bar.style, { top: `${top}px`, left: `${left}px`, width: `${width}px` });
  };

  const unpinBar = () => {
    if (slot && bar.parentElement !== slot) slot.append(bar);
    bar.classList.remove('fphd-table-scrollbar--floating');
    bar.style.removeProperty('top');
    bar.style.removeProperty('left');
    bar.style.removeProperty('width');
  };

  const update = () => {
    frame = 0;
    const current = table();
    const head = current?.tHead;
    if (!current || !head || !shown(scroller)) {
      header.style.display = 'none';
      unpinBar();
      return;
    }

    const frozen = current.querySelector<HTMLElement>(`thead ${FROZEN}:not(${FROZEN}--second)`);
    const frozenWidth = [
      ...(current.tBodies[0]?.rows[0]?.querySelectorAll<HTMLElement>(FROZEN) ?? []),
    ]
      .filter((cell) => getComputedStyle(cell).position === 'sticky')
      .reduce((total, cell) => total + cell.offsetWidth, 0);
    root.style.setProperty('--fphd-frozen-offset', `${frozen?.offsetWidth ?? 0}px`);
    root.style.setProperty('--fphd-frozen-width', `${frozenWidth}px`);

    const { clientWidth, scrollWidth, scrollLeft } = scroller;
    const overflowing = scrollWidth - clientWidth > 1;
    root.classList.toggle('fphd-table-scroll--overflowing', overflowing);
    // The scrollbar sits above the table, so a visible caption is shown above the bar instead.
    const caption = current.caption;
    const moveCaption =
      overflowing && caption !== null && !caption.classList.contains('govuk-visually-hidden');
    captionCopy.textContent = moveCaption && caption ? visibleCaption(caption) : '';
    captionCopy.hidden = !moveCaption;
    caption?.classList.toggle('fphd-table__caption--moved', moveCaption);
    const { width, left, maxScroll } = thumbGeometry({
      trackWidth: clientWidth,
      clientWidth,
      scrollWidth,
      scrollLeft,
    });
    thumb.style.width = `${width}px`;
    thumb.style.transform = `translateX(${left}px)`;
    leftEdge.classList.toggle('fphd-table-edge--visible', overflowing && scrollLeft > 1);
    rightEdge.classList.toggle(
      'fphd-table-edge--visible',
      overflowing && scrollLeft < maxScroll - 1,
    );

    const scrollerBox = scroller.getBoundingClientRect();
    const headBox = head.getBoundingClientRect();
    const tableBox = current.getBoundingClientRect();
    const above = overflowing ? STICKY_GAP + bar.offsetHeight : 0;
    if (
      !headerPinned({
        headTop: headBox.top,
        headHeight: headBox.height,
        tableBottom: tableBox.bottom,
        above,
      })
    ) {
      header.style.display = 'none';
      unpinBar();
      return;
    }

    if (!copy || copiedHead !== head.innerHTML) {
      copy = copyHead(current);
      copiedHead = head.innerHTML;
      header.replaceChildren(copy);
    }
    const top = Math.min(above, tableBox.bottom - headBox.height);
    Object.assign(header.style, {
      display: 'block',
      top: `${top}px`,
      left: `${scrollerBox.left}px`,
      width: `${clientWidth}px`,
    });
    copy.style.width = `${current.offsetWidth}px`;
    copy.style.transform = `translateX(${-scrollLeft}px)`;
    const lastRow = head.rows[head.rows.length - 1];
    const columns = copy.querySelector('colgroup');
    columns?.replaceChildren(
      ...[...(lastRow?.cells ?? [])].map((cell) => {
        const column = document.createElement('col');
        column.style.width = `${cell.getBoundingClientRect().width}px`;
        column.span = cell.colSpan;
        return column;
      }),
    );
    const realRows = [...head.rows];
    [...(copy.tHead?.rows ?? [])].forEach((row, index) => {
      row.style.height = `${realRows[index]?.getBoundingClientRect().height ?? 0}px`;
      [...row.cells].forEach((cell, cellIndex) => {
        const real = realRows[index]?.cells[cellIndex];
        const style = real ? getComputedStyle(real) : undefined;
        const sticky = style?.position === 'sticky';
        // The copy lives outside the page's table rules, so it takes the real cell's text.
        for (const property of COPIED_STYLES) {
          cell.style.setProperty(property, style?.getPropertyValue(property) ?? '');
        }
        cell.style.position = sticky ? 'relative' : '';
        cell.style.transform = sticky ? `translateX(${scrollLeft}px)` : '';
        cell.style.left = sticky ? '0' : '';
      });
    });

    if (overflowing) {
      pinBar(top - bar.offsetHeight, scrollerBox.left, clientWidth);
    } else {
      unpinBar();
    }
  };

  const queue = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  let drag: { pointer: number; x: number; scrollLeft: number } | undefined;
  const onThumbDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    thumb.setPointerCapture(event.pointerId);
    drag = { pointer: event.pointerId, x: event.clientX, scrollLeft: scroller.scrollLeft };
    thumb.classList.add('fphd-table-scrollbar__thumb--dragging');
  };
  const onThumbMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { width, maxScroll } = thumbGeometry({
      trackWidth: scroller.clientWidth,
      clientWidth: scroller.clientWidth,
      scrollWidth: scroller.scrollWidth,
      scrollLeft: scroller.scrollLeft,
    });
    const travel = scroller.clientWidth - width;
    if (travel > 0) {
      scroller.scrollLeft = drag.scrollLeft + ((event.clientX - drag.x) / travel) * maxScroll;
    }
  };
  const onThumbUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag = undefined;
    thumb.classList.remove('fphd-table-scrollbar__thumb--dragging');
  };
  const onTrackDown = (event: PointerEvent) => {
    if (event.button !== 0 || event.target !== bar) return;
    event.preventDefault();
    const thumbBox = thumb.getBoundingClientRect();
    const direction = event.clientX < thumbBox.left ? -1 : 1;
    scroller.scrollBy({ left: direction * scroller.clientWidth * 0.9, behavior: 'smooth' });
  };

  thumb.addEventListener('pointerdown', onThumbDown);
  thumb.addEventListener('pointermove', onThumbMove);
  thumb.addEventListener('pointerup', onThumbUp);
  thumb.addEventListener('pointercancel', onThumbUp);
  bar.addEventListener('pointerdown', onTrackDown);
  scroller.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  const resized = new ResizeObserver(queue);
  resized.observe(scroller);
  let observed = table();
  if (observed) resized.observe(observed);
  update();

  const refresh = () => {
    const current = table();
    if (current !== observed) {
      if (observed) resized.unobserve(observed);
      if (current) resized.observe(current);
      observed = current;
    }
    queue();
  };

  const detach = () => {
    if (frame) cancelAnimationFrame(frame);
    thumb.removeEventListener('pointerdown', onThumbDown);
    thumb.removeEventListener('pointermove', onThumbMove);
    thumb.removeEventListener('pointerup', onThumbUp);
    thumb.removeEventListener('pointercancel', onThumbUp);
    bar.removeEventListener('pointerdown', onTrackDown);
    scroller.removeEventListener('scroll', queue);
    window.removeEventListener('scroll', queue);
    window.removeEventListener('resize', queue);
    resized.disconnect();
    header.remove();
    unpinBar();
  };
  return { refresh, detach };
}
