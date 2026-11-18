export function normalizeReturnTo(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }

  const base = new URL('https://local.invalid');
  const target = new URL(value, base);

  // Dot segments can collapse a local path into a protocol-relative URL: '/..//evil.com'.
  if (target.origin !== base.origin || target.pathname.startsWith('//')) return fallback;

  return `${target.pathname}${target.search}${target.hash}`;
}

const HEX_PATTERN = /^(?:[0-9a-f]{2})+$/i;

/**
 * A return address written as hex, to carry in a query string or form field. DAC's App Gateway
 * refuses some query values that hold characters such as `-`, `=` and `&`, which a page's own
 * query string is full of, and a hex value has none of them.
 */
export function encodeReturnTo(path: string): string {
  return Array.from(new TextEncoder().encode(path), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * The return address `encodeReturnTo` wrote, checked as `normalizeReturnTo` checks one. A value
 * that is not hex for UTF-8 text gives the fallback.
 */
export function decodeReturnTo(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || !HEX_PATTERN.test(value)) return fallback;

  const bytes = Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
  try {
    return normalizeReturnTo(new TextDecoder('utf-8', { fatal: true }).decode(bytes), fallback);
  } catch {
    return fallback;
  }
}
