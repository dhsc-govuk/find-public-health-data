import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from 'react';

export function ScatterCanvas({
  children,
  chartRef,
}: {
  children: (descriptionId: string) => ReactNode;
  chartRef: Ref<HTMLDivElement>;
}) {
  const id = useId();
  const canvas = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>();
  useEffect(() => {
    if (!canvas.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setScale(entry.contentRect.width / 780);
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="fphd-chart-canvas fphd-scatter-canvas" ref={chartRef}>
      <p className="govuk-visually-hidden" id={id}>
        Use the left and right arrow keys to explore the chart.
      </p>
      <div ref={canvas} className="fphd-scatter-canvas__viewport">
        {scale === undefined ? (
          <p className="govuk-body">
            The interactive chart is unavailable. The values are available in the data table.
          </p>
        ) : (
          <div className="fphd-scatter-canvas__plot" style={{ transform: `scale(${scale})` }}>
            {children(id)}
          </div>
        )}
      </div>
    </div>
  );
}
