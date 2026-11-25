import { tidyName } from '@fphd/utils/tidy-name';

/** A key two reference names share, so a name matching it matches neither. */
export const AMBIGUOUS = Symbol('ambiguous');

/** Reference ids by name key, or `AMBIGUOUS` where names differing only in case share a key. */
export type NameIndex = ReadonlyMap<string, string | typeof AMBIGUOUS>;

/**
 * How a name is matched to reference data: tidied, then lower-cased. `toLowerCase` follows
 * Unicode's default mapping, the same on every server whatever its locale.
 */
export function nameKey(name: string): string {
  return tidyName(name).toLowerCase();
}

/** The keys of the two dimensions that have columns of their own, so a category never names them. */
export const SEX = nameKey('Sex');
export const AGE = nameKey('Age');

/** A category's key: its type's and its own, joined by a newline, which tidying never leaves. */
export function categoryKey(type: string, name: string): string {
  return `${nameKey(type)}\n${nameKey(name)}`;
}

/** Indexes reference ids by key, marking a key two ids share rather than keeping either. */
export function nameIndex(entries: Iterable<readonly [key: string, id: string]>): NameIndex {
  const index = new Map<string, string | typeof AMBIGUOUS>();
  for (const [key, id] of entries) {
    const existing = index.get(key);
    index.set(key, existing === undefined || existing === id ? id : AMBIGUOUS);
  }
  return index;
}
