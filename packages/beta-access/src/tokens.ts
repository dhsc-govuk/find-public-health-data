import { errors, jwtVerify, SignJWT } from 'jose';

const ISSUER = 'fphd-public-web';

/** Distinct audiences, so a sign-in link's token never works as an access cookie or the reverse. */
const AUDIENCES = {
  link: 'fphd-private-beta-link',
  access: 'fphd-private-beta-access',
} as const;

export type TokenPurpose = keyof typeof AUDIENCES;

export interface TokenSigner {
  sign(purpose: TokenPurpose, email: string, issuedAt: Date, expiresAt: Date): Promise<string>;
  /** The email address a valid token was issued to, or undefined. */
  verify(purpose: TokenPurpose, token: string, now: Date): Promise<string | undefined>;
}

function seconds(date: Date): number {
  return Math.floor(date.getTime() / 1_000);
}

export function createTokenSigner(secret: string): TokenSigner {
  const key = new TextEncoder().encode(secret);

  return {
    sign(purpose, email, issuedAt, expiresAt) {
      return new SignJWT()
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCES[purpose])
        .setSubject(email)
        .setIssuedAt(seconds(issuedAt))
        .setExpirationTime(seconds(expiresAt))
        .sign(key);
    },

    async verify(purpose, token, now) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          audience: AUDIENCES[purpose],
          currentDate: now,
          issuer: ISSUER,
          requiredClaims: ['exp', 'sub'],
        });
        return payload.sub;
      } catch (error) {
        if (error instanceof errors.JOSEError) return undefined;
        throw error;
      }
    },
  };
}
