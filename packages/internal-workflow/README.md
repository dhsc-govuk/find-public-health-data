# @fphd/internal-workflow

The indicator workflow: the state machine that says which steps a version may take, the engine that
takes a step in one transaction, and scheduled publication, which takes the `publish` step for each
version whose time has come. The `internal-` prefix keeps it out of the public images, as
`tools/artefact-boundary` checks.

Built package; consumed by `@fphd/internal-api-features`, whose routes take every step other than
`publish`, and by `@fphd/internal-worker`, which takes the `publish` step. It depends on `@fphd/db`,
`@fphd/internal-read-models`, `@fphd/logger`, `@fphd/utils` and `drizzle-orm`, and not on
`@fphd/auth`, Express or the upload code, so an app that uses it only to publish does not take those
on through it. The checks on who may take a step stay in `@fphd/internal-api-features`, with the
fake users' roles. A step that starts a submission is passed the reviewers it carries over
(`reviewersToCarry`), and refuses to run without them.

| Entry | Purpose                                                                                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`   | `allowedSteps`; `takeIndicatorStep` and `takeIndicatorStepIn`, the step engine, with their option types; `publishDueVersions` and `publishNextDueVersion`; `isPublished`, `Transaction`, `hasSqlState` and `violatesConstraint` |

## Tests

The state machine's unit tests are here: `vitest run --project @fphd/internal-workflow`, or the root
`pnpm test:unit`. The engine and scheduled publication are tested through the steps that reach them,
in `@fphd/internal-api-features`' integration tests, since those build drafts through its submit,
review and schedule steps.
