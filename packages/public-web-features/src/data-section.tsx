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
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const errorElement = (
    <p className="govuk-body">
      {label} could not be loaded.{' '}
      <a className="govuk-link" href={url}>
        Try again
      </a>
      .
    </p>
  );
  // Keep the same tree when document values become deferred navigation data, preserving controls.
  return (
    <Suspense
      key={location.pathname}
      fallback={
        hydrated ? (
          <p className="govuk-body" role="status">
            Loading {label}…
          </p>
        ) : (
          // An aborted server render must still offer recovery without JavaScript.
          errorElement
        )
      }
    >
      <Await resolve={resolve} errorElement={errorElement}>
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
