/** The apps people sign in to: internal-web alone, since public-web has no sign-in. */
export type AppAudience = 'internal';

/** The web app sets this cookie, and its server forwards it to the API under the same name. */
export function sessionCookieName(audience: AppAudience): string {
  return `fphd-${audience}-session`;
}
