# @fphd/config

Environment parsing shared by every app. Each app reads `process.env` in exactly one place, its
`load-config.ts`, and builds that schema from the fragments here so the same variable means the
same thing everywhere. Shared helpers that are not configuration belong in `@fphd/utils`.

Built package.

| Entry     | Purpose                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------- |
| `.`       | `z` (the single zod instance every schema is built with), the env fragments (`appEnvFields`, `serverEnvFields`, `logEnvFields`), the value schemas (`appEnvSchema`, `boolSchema`, `portSchema`), `parseEnv`, `loadWebServerConfig` (public-web) and `loadSignInWebServerConfig` (internal-web, with the session secrets), `resolveLog`, `resolveShutdown`, `isDeployedEnv` |
| `./zod`   | The same `z` for code that wants zod and nothing else                                              |

Depend on this package rather than on `zod` directly, so schema fragments and app schemas never
mix zod instances.
