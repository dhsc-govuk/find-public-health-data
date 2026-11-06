# @fphd/auth

The session model shared by internal-web, the API apps and `@fphd/web-server`: which audience a
session is for (internal-web is the only app with sign-in), the roles and teams, the fake users local sign-in offers, the JWT cookie that
carries a session from a web app to its API, and the permission checks over it.

Built package.

| Entry               | Purpose                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `.`                 | `AppAudience`, `sessionCookieName`, `ROLES`, `TEAMS`, the fake user list, `normalizeReturnTo` |
| `./permissions`     | The `can*` checks each role decision goes through, and `indicatorListScope`, the list filter `canSeeIndicator` implies |
| `./jwt-session`     | `createJwtSessionService` issues and verifies the session JWT; `createJwtSessionVerifier` narrows it to the verify-only shape the APIs need |
| `./cookies`         | `readCookie`, the one cookie parser both sides use                                          |
| `./session-errors`  | `InvalidJwtSessionError`, thrown by verification and mapped to a cleared cookie by callers  |

Sessions are stateless: nothing is stored server-side, so a session ends when its cookie expires
or is cleared.

The session carries the user's `app_user` id as its subject, their roles, and the ids of their
teams. A fake user's roles and teams are fixed here, keyed by the user's id; the ids match the
`app_user` and `team` rows the migrations in `@fphd/db-operations` insert, which a test there
checks.

Every decision about what a role may do goes through a `can*` function in `./permissions`, in the
APIs and the web apps alike, so no guard, route, loader, repository or page tests a role itself. The module is interim, until the
check mechanism is designed from the full permissions matrix.
