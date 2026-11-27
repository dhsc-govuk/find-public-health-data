/**
 * The fixed timestamp of every id the migration tool derives, so an id depends only on its tag
 * and suffix and never on when it was made.
 */
export const DERIVED_ID_TIMESTAMP_MS = 1_777_593_600_000n;

/**
 * A UUIDv7 holding the millisecond timestamp, a 12-bit tag in place of the first random field
 * and a 62-bit suffix in place of the second, formatted as lowercase hex in the usual groups.
 */
export function uuid7(timestampMs: bigint, tag: number, suffix: bigint): string {
  if (timestampMs < 0n || timestampMs >= 1n << 48n)
    throw new Error(`UUIDv7 timestamp is outside 48 bits: ${timestampMs}`);
  if (!Number.isInteger(tag) || tag < 0 || tag >= 1 << 12)
    throw new Error(`UUIDv7 tag is outside 12 bits: ${tag}`);
  if (suffix < 0n || suffix >= 1n << 62n)
    throw new Error(`UUIDv7 suffix is outside 62 bits: ${suffix}`);
  const value =
    (timestampMs << 80n) | (0x7n << 76n) | (BigInt(tag) << 64n) | (0x2n << 62n) | suffix;
  const hex = value.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
