import { type ReactNode, Suspense, useEffect, useState } from 'react';
import { Await, useLocation } from 'react-router';

export function DataSection<T>({
  label,
  resolve,
  children,
}: {
  label: string;
  resolve: T | Promise<T>;
  children: (data: T) => ReactNode;
}) {
  const location = useLocation();
  const url = `${location.pathname}${location.search}${location.hash}`;
  if (!(resolve instanceof Promise)) return children(resolve);
  return (
    <Suspense
      key={location.pathname}
      fallback={
        <p className="govuk-body" role="status">
          Loading {label}…
        </p>
      }
    >
      <Await
        resolve={resolve}
        errorElement={
          <p className="govuk-body">
            {label} could not be loaded.{' '}
            <a className="govuk-link" href={url}>
              Try again
            </a>
            .
          </p>
        }
      >
        {children}
      </Await>
    </Suspense>
  );
}

export function useDataReady(values: unknown[]) {
  const [settled, setSettled] = useState<unknown[]>([]);
  const ready = values.every(
    (value, index) => !(value instanceof Promise) || settled[index] === value,
  );
  useEffect(() => {
    if (ready) return;
    let active = true;
    void Promise.allSettled(values).then(() => {
      if (active) setSettled(values);
    });
    return () => {
      active = false;
    };
  }, [values, ready]);
  return ready;
}

export function CompletePageLink({ complete }: { complete: boolean }) {
  const location = useLocation();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (complete || hydrated) return null;
  const params = new URLSearchParams(location.search);
  params.set('render', 'complete');
  return (
    <p className="govuk-body">
      <a className="govuk-link" href={`${location.pathname}?${params}${location.hash}`}>
        Show all sections
      </a>{' '}
      to load this page without JavaScript.
    </p>
  );
}
