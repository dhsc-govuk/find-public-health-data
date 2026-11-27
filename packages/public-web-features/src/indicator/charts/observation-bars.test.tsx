// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { cloneElement, type ReactElement, type Ref } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { indicatorDetail, observation } from '../view.testing.ts';
import { ObservationBars, wrapCategory } from './observation-bars.tsx';

// The width the chart is drawn at, which a test may narrow to a phone's.
let canvasWidth = 640;

vi.mock('./chart-elements.tsx', async (original) => ({
  ...(await original<typeof import('./chart-elements.tsx')>()),
  ChartCanvas: ({
    children,
    chartRef,
  }: {
    children: (id: string) => ReactElement;
    chartRef: Ref<HTMLDivElement>;
  }) => (
    <div ref={chartRef}>
      {cloneElement(children('description') as ReactElement<{ width: number; height: number }>, {
        width: canvasWidth,
        height: 400,
      })}
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  canvasWidth = 640;
});

it.each([
  [undefined, 'higher-is-better', ['#f46a25', '#ffc000', '#12436d']],
  ['rag', 'higher-is-better', ['#8ed973', '#ffc000', '#c00000']],
  ['rag', 'lower-is-better', ['#f46a25', '#ffc000', '#12436d']],
] as const)('uses %s for %s while sorting and deriving its own mean', (mode, polarity, colours) => {
  const rows = [10, 8, 12].map((value) => ({
    key: String(value),
    name: String(value),
    observation: {
      ...observation(value),
      lowerCi95: null,
      upperCi95: null,
      lowerCi998: null,
      upperCi998: null,
    },
  }));
  const { container } = render(
    <ObservationBars
      rows={rows}
      confidence="none"
      indicator={indicatorDetail(108, { polarity })}
      title="Bars"
      group="Area"
      averageEntity="England"
      {...(mode ? { colourMode: mode } : {})}
    />,
  );
  expect(
    [...container.querySelectorAll('.recharts-bar-rectangle path')].map((bar) =>
      bar.getAttribute('fill'),
    ),
  ).toEqual(colours);
  expect(
    [...container.querySelectorAll('.fphd-bar-value')].map((label) => label.textContent),
  ).toEqual(['12.0%', '10.0%', '8.0%']);
  expect(
    container.querySelector('.recharts-reference-line-line')?.getAttribute('stroke-width'),
  ).toBe('1');
  expect(container.textContent).toContain('England average 10.0%');
});

it('renders the base variant in one dark blue without an average line', () => {
  const { container } = render(
    <ObservationBars
      rows={[8, 12].map((value) => ({
        key: String(value),
        name: String(value),
        observation: observation(value),
      }))}
      confidence="none"
      indicator={indicatorDetail()}
      title="Bars"
      group="Area"
    />,
  );
  expect(
    [...container.querySelectorAll('.recharts-bar-rectangle path')].map((bar) =>
      bar.getAttribute('fill'),
    ),
  ).toEqual(['#12436d', '#12436d']);
  expect(container.querySelector('.recharts-reference-line-line')).toBeNull();
  expect(container.textContent).not.toContain('Comparison');
});

it('wraps full category names at word boundaries without shortening them', () => {
  expect(wrapCategory('Second most deprived decile (IMD2019)', 15)).toEqual([
    'Second most',
    'deprived decile',
    '(IMD2019)',
  ]);
});

it.each([375, 1280])(
  'labels the bars with the unit signs alone, so a long unit leaves them their width at %ipx',
  (width) => {
    canvasWidth = width;
    const { container } = render(
      <ObservationBars
        rows={[8, 12].map((value) => ({
          key: String(value),
          name: String(value),
          observation: observation(value),
        }))}
        confidence="none"
        indicator={indicatorDetail(108, { unit: 'admissions per 100,000 people' })}
        title="Bars"
        group="Area"
      />,
    );

    expect(
      [...container.querySelectorAll('.fphd-bar-value')].map((label) => label.textContent),
    ).toEqual(['12.0', '8.0']);
    const barWidths = [...container.querySelectorAll('.recharts-bar-rectangle path')].map((bar) =>
      Number(bar.getAttribute('width')),
    );
    expect(Math.min(...barWidths)).toBeGreaterThan(0);
    expect(Math.max(...barWidths)).toBeGreaterThan(width / 4);
  },
);
