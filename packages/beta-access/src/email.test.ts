import { describe, expect, it } from 'vitest';

import { signInEmail } from './email.ts';

describe('signInEmail', () => {
  const link = 'https://beta.example.com/private-beta/sign-in?token=abc&returnTo=%2F';

  it('gives the link, how long it lasts and what to do if it was not asked for', () => {
    const email = signInEmail('sam@example.com', link, 15);

    expect(email.to).toBe('sam@example.com');
    expect(email.subject).toBe('Sign in to Find public health data');
    expect(email.plainText).toContain(`\n\n${link}\n\n`);
    expect(email.plainText).toContain('The link expires in 15 minutes.');
    expect(email.plainText).toContain('If you did not ask to sign in, you can ignore this email.');
  });

  it('escapes the link in the HTML version', () => {
    expect(signInEmail('sam@example.com', link, 15).html).toContain(
      'href="https://beta.example.com/private-beta/sign-in?token=abc&amp;returnTo=%2F"',
    );
  });
});
