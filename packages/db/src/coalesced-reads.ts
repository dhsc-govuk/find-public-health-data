function coalesceRead<Args extends unknown[], Value>(
  read: (...args: Args) => Promise<Value>,
): (...args: Args) => Promise<Value> {
  const pending = new Map<string, Promise<Value>>();
  return (...args) => {
    const key = JSON.stringify(args);
    const existing = pending.get(key);
    if (existing) return existing;
    const result = Promise.resolve()
      .then(() => read(...args))
      .finally(() => pending.delete(key));
    pending.set(key, result);
    return result;
  };
}

/** Share only pending reads; a completed read never serves a later request. */
export function coalescedReads<
  T extends { [K in keyof T]: (...args: never[]) => Promise<unknown> },
>(reads: T): T {
  const result = { ...reads };
  for (const name in reads) result[name] = coalesceRead(reads[name]) as T[typeof name];
  return result;
}
