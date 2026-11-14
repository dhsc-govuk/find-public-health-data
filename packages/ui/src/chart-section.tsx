import type { ReactNode } from 'react';

interface ChartSectionProps {
  children?: ReactNode;
  description?: string;
  id: string;
  title: string;
}

export function ChartSection({ children, description, id, title }: ChartSectionProps) {
  return (
    <section aria-label={title} className="fphd-chart-section" id={id}>
      {description ? <p className="govuk-body">{description}</p> : null}
      {children}
    </section>
  );
}
