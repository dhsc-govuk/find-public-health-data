import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { createJwtSessionService } from './jwt-session.ts';

const secret = 'a-jwt-session-secret-that-is-long-enough-for-tests';
const now = new Date('2026-10-14T10:00:00.000Z');
const service = createJwtSessionService({
  audience: 'fphd-internal',
  clock: () => now,
  cookieName: 'fphd-internal-session',
  issuer: 'fphd-auth',
  secret,
  secure: false,
});

describe('verifyToken', () => {
  it('rejects a session issued without teams', async () => {
    const issuedAt = Math.floor(now.getTime() / 1_000);
    const token = await new SignJWT({ roles: ['publisher'] })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('fphd-auth')
      .setAudience('fphd-internal')
      .setSubject('internal-publisher')
      .setJti('a-session')
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 900)
      .sign(new TextEncoder().encode(secret));

    await expect(service.verifyToken(token)).rejects.toThrow('Invalid JWT session');
  });
});

describe('issueToken', () => {
  it('refuses a blank team', async () => {
    await expect(
      service.issueToken({
        expiresInSeconds: 900,
        roles: ['public'],
        subject: 'a',
        teams: [' '],
      }),
    ).rejects.toThrow('JWT session teams must be non-empty strings');
  });
});
