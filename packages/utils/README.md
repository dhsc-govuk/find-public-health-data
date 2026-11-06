# @fphd/utils

Small, side-effect-free helpers shared across the apps and packages that are not configuration.
Configuration and the shared zod instance stay in `@fphd/config`.

Built package with a `browser` export condition, so the same modules serve Node and the web bundles.
Nothing here may import Node-only code: the tsconfig types the source against the browser and leaves
out `@types/node`, so a `node:` import or a `process` reference fails `pnpm typecheck`.

There is no root export; import each module by its subpath.

| Entry                 | Purpose                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `./control-character` | `CONTROL_CHARACTER` and `CONTROL_CHARACTER_BUT_NEWLINE_OR_TAB`, the one definition of a control character refused in text                                                                                                                  |
| `./indicator-path`    | `indicatorPath`, the address of the public indicator page for a slug, which both web apps serve                                                                                                                                            |
| `./short-id`          | `SHORT_ID_PATTERN`, `MAX_SHORT_ID` and `isShortId`, the one definition of the public indicator number — a run of digits an integer column can hold                                                                                         |
| `./slug`              | `SLUG_PATTERN` and `SLUG_MAX_LENGTH`, the one definition of a URL slug; `slugify` and `slugProblem`, which derive one from a name and say why a name yields none; `RESERVED_SLUGS`/`isReservedSlug`, the path segments a slug may not take |
| `./tidy-name`         | `tidyName`, the form in which uploaded names are matched to reference data — trimmed, each run of whitespace one space                                                                                                                     |

The seed export's `packages/db-operations/data/seed/export/slug.py` mirrors `./slug` and must change
with it. `packages/db-operations/data/seed/export/tidy-reference-names.py` and the
tidy-reference-names migration mirror `./tidy-name` likewise.

## Prerequisites

The workspace setup in the root `README.md`.

## Testing

`vitest run --project @fphd/utils`, or the root `pnpm test:unit`.
