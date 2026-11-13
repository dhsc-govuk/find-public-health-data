export function dataDictionary<T>() {
  const entries: T[] = [];
  const indices = new Map<string, number>();
  return {
    entries,
    index(value: T) {
      const key = JSON.stringify(value);
      const existing = indices.get(key);
      if (existing !== undefined) return existing;
      const index = entries.length;
      entries.push(value);
      indices.set(key, index);
      return index;
    },
  };
}

export function dictionaryEntry<T>(entries: T[], index: number): T {
  const value = entries[index];
  if (value === undefined) throw new Error('Invalid data catalogue');
  return value;
}
