import { type RefObject, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function SpineChartTooltips({
  anchor,
  id,
  title,
  period,
  area,
  benchmark,
  onPointerEnter,
  onPointerLeave,
}: {
  anchor: RefObject<HTMLDivElement | null>;
  id: string;
  title: string;
  period: string;
  area: string[] | undefined;
  benchmark: string[] | undefined;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const areaTip = useRef<HTMLDivElement>(null);
  const benchmarkTip = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const position = () => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box) return;
      const tips = [areaTip.current, benchmarkTip.current].filter((tip) => tip !== null);
      let below = box.bottom;
      let above = box.top;
      for (const [index, tip] of tips.entries()) {
        const { width, height } = tip.getBoundingClientRect();
        const fitsAbove = above - height >= 8;
        const fitsBelow = below + height <= window.innerHeight - 8;
        const useAbove = fitsAbove && (index === 0 || !fitsBelow);
        const top = useAbove ? above - height : below;
        tip.style.top = `${Math.max(8, top)}px`;
        tip.style.left = `${Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8))}px`;
        tip.dataset.placement = useAbove ? 'above' : 'below';
        if (useAbove) above = top - 8;
        else below = top + height + 8;
      }
    };
    position();
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    return () => {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
    };
  });
  return createPortal(
    (
      [
        { kind: 'area', lines: area, ref: areaTip },
        { kind: 'benchmark', lines: benchmark, ref: benchmarkTip },
      ] as const
    ).map(({ kind, lines, ref }) =>
      lines ? (
        <div
          key={kind}
          ref={ref}
          id={`${id}-${kind}`}
          role="tooltip"
          className="fphd-range-tooltip"
          onPointerMove={(event) => event.stopPropagation()}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
        >
          <strong>{title}</strong>
          <span>Period: {period}</span>
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null,
    ),
    anchor.current?.closest('.govuk-template__page') ?? document.body,
  );
}
