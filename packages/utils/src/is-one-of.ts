/** Whether `value` is one of `values`, narrowing it to their type when it is. */
export function isOneOf<T>(values: readonly T[], value: unknown): value is T {
  return (values as readonly unknown[]).includes(value);
}
