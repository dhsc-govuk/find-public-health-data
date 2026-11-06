# @fphd/beta-access

public-web's private beta. Only the invitees listed in `BETA_ACCESS_INVITEES` can use the site.
Each signs in by asking for a link on `/private-beta`, which is emailed to their address and works
for 15 minutes. The link sets an access cookie, which lasts 30 days or until the private beta ends,
whichever comes first. Every request checks the cookie and that its address is still on the list, so
taking someone off the list ends their access when public-web next restarts with the new list.

Built package; consumed by `public-web`, which builds the service once at startup and sets it on
each request's context, and by `@fphd/public-web-features`, whose private beta pages use it. It
holds the Azure Communication Services SDK, so the SDK stays out of internal-web's image.

| Entry       | Purpose                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| `.`         | `createBetaAccess`, which checks invitees, issues links and access cookies; `createAcsEmailSender` |
| `./context` | `betaAccessContext`, the `BetaAccess` type and the private beta's paths. Safe in the browser bundle |
| `./gate`    | `betaAccessMiddleware`, the React Router middleware public-web's `private-beta-gate.tsx` layout runs |

## Configuration

`loadWebServerConfig` in `@fphd/config` reads it; `.env.example` describes each variable.
Deployed, `EMAIL_ENDPOINT` and `EMAIL_SENDER_ADDRESS` name the Communication Services resource and
sender, and public-web signs in to it as the managed identity `AZURE_CLIENT_ID` names. In local and
test there is no email service: the page shows each link instead of sending it, which is how the
e2e specs sign in.

Links and cookies are JWTs signed with `BETA_ACCESS_SECRET`, with different audiences so neither
works as the other. Links are built from `SITE_URL`, never from the request's Host header, which a
client can set. Each address is emailed at most once a minute. That count is held in memory, so each
replica keeps its own.

## Tests

`vitest run --project @fphd/beta-access`. The email sender itself is not tested here: it only
hands the message to the SDK.
