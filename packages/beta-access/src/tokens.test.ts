import { describe, expect, it } from 'vitest';

import { createTokenSigner } from './tokens.ts';

const secret = 'a-beta-access-secret-that-is-long-enough';
const issuedAt = new Date('2026-11-10T09:00:00Z');
const expiresAt = new Date('2026-11-10T09:15:00Z');
const beforeExpiry = new Date('2026-11-10T09:14:59Z');

describe('createTokenSigner', () => {
  const signer = createTokenSigner(secret);

  it('verifies a token it signed to the email address it was issued to', async () => {
    const token = await signer.sign('link', 'sam@example.com', issuedAt, expiresAt);

    await expect(signer.verify('link', token, beforeExpiry)).resolves.toBe('sam@example.com');
  });

  it('rejects a token once it has expired', async () => {
    const token = await signer.sign('link', 'sam@example.com', issuedAt, expiresAt);

    await expect(signer.verify('link', token, expiresAt)).resolves.toBe(undefined);
  });

  it('rejects a sign-in link token as an access token, and the reverse', async () => {
    const link = await signer.sign('link', 'sam@example.com', issuedAt, expiresAt);
    const access = await signer.sign('access', 'sam@example.com', issuedAt, expiresAt);

    await expect(signer.verify('access', link, beforeExpiry)).resolves.toBe(undefined);
    await expect(signer.verify('link', access, beforeExpiry)).resolves.toBe(undefined);
  });

  it('rejects a token signed with another secret', async () => {
    const other = createTokenSigner('another-beta-access-secret-that-is-long-enough');
    const token = await other.sign('link', 'sam@example.com', issuedAt, expiresAt);

    await expect(signer.verify('link', token, beforeExpiry)).resolves.toBe(undefined);
  });

  it('rejects a tampered token and one that is not a token at all', async () => {
    const token = await signer.sign('link', 'sam@example.com', issuedAt, expiresAt);
    const [header, , signature] = token.split('.');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'someone@example.com', exp: 9_999_999_999 }),
    ).toString('base64url');

    await expect(
      signer.verify('link', `${header}.${payload}.${signature}`, beforeExpiry),
    ).resolves.toBe(undefined);
    await expect(signer.verify('link', 'not-a-token', beforeExpiry)).resolves.toBe(undefined);
  });
});
