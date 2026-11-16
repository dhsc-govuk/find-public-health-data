// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachStickyTable } from './sticky-table.ts';

const box = (top: number, height: number) =>
  ({
    top,
    bottom: top + height,
    height,
    left: 20,
    right: 520,
    width: 500,
    x: 20,
    y: top,
  }) as DOMRect;

function setUp() {
  document.body.innerHTML = `
    <div class="fphd-tabs" style="transform: translateX(-50%)">
      <div id="root">
        <p id="caption-copy" hidden></p>
        <div id="slot"><div id="bar-container"><div id="bar"><div id="thumb"></div></div></div></div>
        <section id="scroller">
          <table><caption>Table</caption><thead><tr><th>Period</th></tr></thead>
          <tbody><tr><th>2024</th></tr></tbody></table>
        </section>
        <div id="left"></div><div id="right"></div>
      </div>
    </div>`;
  const byId = (id: string) => document.getElementById(id) as HTMLElement;
  const scroller = byId('scroller');
  const bar = byId('bar');
  Object.defineProperties(scroller, {
    offsetParent: { get: () => document.body },
    clientWidth: { get: () => 500 },
    scrollWidth: { get: () => 1500 },
  });
  Object.defineProperty(bar, 'offsetHeight', { get: () => 24 });
  const table = scroller.querySelector('table') as HTMLTableElement;
  const head = table.tHead as HTMLTableSectionElement;
  let headTop = 100;
  head.getBoundingClientRect = () => box(headTop, 40);
  table.getBoundingClientRect = () => box(headTop, 800);
  scroller.getBoundingClientRect = () => box(headTop, 800);
  return {
    bar,
    barContainer: byId('bar-container'),
    slot: byId('slot'),
    scrollTo: (top: number) => {
      headTop = top;
    },
    elements: {
      root: byId('root'),
      captionCopy: byId('caption-copy'),
      barContainer: byId('bar-container'),
      bar,
      thumb: byId('thumb'),
      scroller,
      leftEdge: byId('left'),
      rightEdge: byId('right'),
    },
  };
}

describe('attachStickyTable', () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('floats the scrollbar from the body, out of any transformed ancestor, while the head is pinned', () => {
    const { bar, barContainer, slot, scrollTo, elements } = setUp();
    const sticky = attachStickyTable(elements);
    expect(barContainer.parentElement).toBe(slot);
    expect(bar.parentElement).toBe(barContainer);

    scrollTo(-200);
    window.dispatchEvent(new Event('scroll'));
    for (const frame of frames.splice(0)) frame(0);
    expect(barContainer.parentElement).toBe(document.body);
    expect(bar.parentElement).toBe(barContainer);
    expect(bar.classList).toContain('fphd-table-scrollbar--floating');
    expect(bar.style.top).toBe('6px');

    scrollTo(100);
    window.dispatchEvent(new Event('scroll'));
    for (const frame of frames.splice(0)) frame(0);
    expect(barContainer.parentElement).toBe(slot);
    expect(bar.parentElement).toBe(barContainer);
    expect(bar.classList).not.toContain('fphd-table-scrollbar--floating');
    expect(bar.style.top).toBe('');

    scrollTo(-200);
    window.dispatchEvent(new Event('scroll'));
    for (const frame of frames.splice(0)) frame(0);
    sticky.detach();
    expect(barContainer.parentElement).toBe(slot);
    expect(bar.parentElement).toBe(barContainer);
    expect(document.querySelector('.fphd-sticky-header')).toBeNull();
  });
});
