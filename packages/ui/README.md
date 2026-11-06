# @fphd/ui

React components and styles shared by both web apps: the GOV.UK components re-exported from
`@not-govuk/*`, the service's own components (`AppShell`, `AppDocument`, `CardList`, `FilterCard`,
`GeographyTree`, `ChartSection`, `PageIntro` and the rest of `src/*.tsx`), and the helpers that go
with them (`formatDate`, `createDocumentMeta`, `DocumentTitle`).

Source-only package, bundled by Vite; no build step.

| Entry           | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `.`             | Components and helpers                                           |
| `./hydrate`     | `hydrateWebApp`, the shared `entry.client.tsx` body              |
| `./nonce`       | `NonceProvider` and `useNonce`, the CSP nonce for inline scripts |
| `./styles.scss` | The stylesheet each app's `root.tsx` imports                     |

Styles are three partials: `_govuk-core.scss` (GOV.UK Frontend), `_not-govuk-overrides.scss` and
`_fphd-components.scss`. Custom class names carry the `fphd-` prefix; `govuk-*` is reserved for
GOV.UK Frontend.
