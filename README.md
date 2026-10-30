# Find Public Health Data

A pnpm monorepo containing four independently deployable applications:

| Application | Package | Default port |
| --- | --- | ---: |
| Public web | `@fphd/public-web` | 3000 |
| Internal web | `@fphd/internal-web` | 3001 |
| Public API | `@fphd/public-api` | 4000 |
| Internal API | `@fphd/internal-api` | 4001 |

The internal applications are functional supersets of the public applications through shared
workspace packages. Deployable applications do not import one another.

Alongside them sits `@fphd/operations`, which serves no traffic and has no port. It is a
command-line application, run as a job — see [Operational commands](#operational-commands).

## Requirements

- Node.js 24+
- pnpm 11.18.0
- Docker, to run the development database and storage emulator

Corepack will select the pinned pnpm version from `package.json`.

## Getting started

```sh
cp .env.example .env    # required — see Configuration below
pnpm install
pnpm services:up        # start the development database and Azurite, and wait for them
pnpm db:bootstrap       # once per fresh database: create the per-API login roles
pnpm dev
```

`pnpm dev` (and `dev:public`, `dev:internal`, `dev:mixed`) starts the Docker services it needs and
waits for them to report healthy before running any app, so no separate `docker compose up` is
needed. A **brand-new** database is empty until migrated — see [Database](#database).

## Configuration

Environment variables are read from a `.env` file at the repository root. `.env` is not committed;
`.env.example` lists every variable with development-safe values, so copying it is enough to get a
working local setup.

The three passwords (`POSTGRES_PASSWORD`, `PUBLIC_API_PASSWORD`, `INTERNAL_API_PASSWORD`) have **no
default**. If any is unset or empty, the command that needs it — `docker compose` for the first,
`pnpm db:bootstrap` and the app containers for the other two — fails with a message naming the
variable rather than creating a database role with a well-known password.

`APP_ENV` names the environment: `local` | `test` | `dev` | `preview` | `production`. It has **no
default either**, and for the same reason. `local` is a developer machine and `test` a test run or
CI job; both mean everything is on this machine over http, so both relax settings that must hold
when deployed — database TLS and secure session cookies. A default could only be `local`, which
would let an unset variable pick the relaxed side in silence. Every runtime supplies it: `.env` for
development, `compose.yaml` for the containers, the `test:integration` script for test runs, and the
platform for deployed services.

internal-api keeps uploaded data files in Azure Blob Storage. `STORAGE_CONTAINER` names the
container; deployed, `STORAGE_ACCOUNT_URL` and `AZURE_CLIENT_ID` connect with the app's managed
identity. Locally and in CI, `STORAGE_CONNECTION_STRING` connects to
[Azurite](https://github.com/Azure/Azurite), Microsoft's storage emulator, which runs as a compose
service beside the database; internal-api creates the container on startup if it is missing. A
connection string is refused when `APP_ENV` is a deployed environment.

`DB_TLS` turns TLS to the database on or off. Left unset it follows `APP_ENV`: off for `local` and
`test`, where the database is the compose container and presents no certificate, and on everywhere
else, because every managed Postgres this deploys to requires it. Certificates are verified against
Node's CA store — so it is not a way to accept an unknown certificate, and no CA bundle has to be
shipped. Set it only to override the default in a deployed environment.

`SESSION_JWT_SECRET` signs JWT session cookies issued by the authentication backend. The example
value is for local development only; each deployed service must receive a secret of at least 32
bytes from the deployment environment. Services issuing and validating a session for the same
audience must receive the same secret. Web applications validate the JWT before exposing its
subject and roles to route middleware, and personalized responses are marked private and
non-cacheable.

Authentication currently uses fixed fake users. The sign-in form posts to the web backend, which
creates a one-use authorization code; its callback exchanges that code for an eight-hour JWT
cookie. Public routes remain available anonymously, and the public app offers no sign-in for now.
Internal routes send a signed-out visitor to a landing page that leads to sign-in, and accept only
fake users carrying the `internal` role. Both internal users are publishers, which the dashboard
requires; the management navigation, the `/manage` routes and the topics API require the `admin`
role, which only one of them holds. The public surface of the internal API remains open, but
`/api/internal` independently validates the JWT and requires the role each route names. Sign-out
clears the JWT cookie.

## Commands

```sh
pnpm install
pnpm dev
pnpm dev:public
pnpm dev:internal
pnpm check
pnpm check:artefacts   # assert no internal code, secret or database operation reaches an artifact
pnpm check:e2e-coverage # assert every page route has an e2e spec and every spec scans with axe
pnpm check:migrations  # assert the schema holds no change its migrations do not
pnpm build
pnpm test              # unit then integration tests (not e2e)
pnpm test:unit         # unit tests
pnpm test:integration  # integration tests — need the local database and Azurite running
pnpm test:e2e          # end-to-end tests — need the stack serving and the database seeded
```

Each application builds to its own `dist` directory, giving CI and deployment tooling four
unambiguous artifacts.

## Continuous integration

`.github/workflows/ci.yml` runs lint, typecheck, unit tests, integration tests, e2e tests, the route
budgets, `pnpm audit`, a gitleaks secret scan of the full git history, build, the image builds and
scans, the public artifact boundary check, the migration drift check and the e2e coverage checks as
parallel jobs, except that the e2e tests, the route budgets and the image scans wait for the image
build. A final `All checks pass` job aggregates them and is the single required status check for
merging, so the required-check list does not need editing whenever a job is added — but a new job
must be added to that job's `needs` list, or it gates nothing.

Runs are triggered on every pull request (on open, on every push to the branch, on reopening, and
when a draft is marked ready for review) and on every push to `main`. A draft pull request skips the
e2e tests, the route budgets, the image builds and the web-changes check, so its `All checks pass`
gate stays red until it is marked ready for review.

The route budgets job (`pnpm check:perf`, see [tools/perf](tools/perf/README.md)) counts the SQL
statements, database pages and rows each of a set of routes costs, and its response size, and fails
when a route exceeds `tools/perf/baseline.json` by more than its tolerance or its median time passes
a generous limit. An intended increase is accepted with `pnpm perf:accept <run-id>` and committed.

`pnpm check` is the local equivalent for lint, typecheck, the migration drift check, unit and
integration tests, build, the artefact boundary and the e2e coverage checks. It needs the local
database and blob storage running (`docker compose up -d db azurite`) for the integration tier, but
no apps: it leaves out the e2e tests, which CI runs on pull requests. Run `pnpm test:e2e` yourself
for front-end work (see the e2e notes below). CI additionally runs
`pnpm audit --audit-level high`, which fails on high and critical advisories, so a newly published
advisory can redden a pull request that changed nothing. Where a real advisory has no fix and
blocks all work, `pnpm.auditConfig.ignoreGhsas` is the escape hatch; each entry is a reviewable
decision.

`pnpm install` also refuses any version published within the last three days, transitive
dependencies included: `minimumReleaseAge` in `pnpm-workspace.yaml` is set explicitly so the
policy is visible and does not move with pnpm's own default. It is enforced both when resolving a
bump and when CI installs from the lockfile, so a too-new version fails locally rather than only in
CI. The NotGovUK and react-foundry packages are permanently excluded, because they are maintained
alongside this project and their releases are often taken straight away. To take any other version
that is still inside the window, add a `name@version` entry to `minimumReleaseAgeExclude` with a
note of when it can go, and remove it once the version has aged out. Do not pass
`--trust-lockfile`: it skips the verification entirely.

`postgres@3.4.9` has a pnpm patch for [upstream COPY error handling](https://github.com/porsager/postgres/pull/1183):
a server error after COPY finishes sending must reject the writable so the transaction rolls back.
Remove the patch when a released version includes that fix.

Each tier is its own CI job, so the jobs run `pnpm test:unit`, `pnpm test:integration` and
`pnpm test:e2e` individually.

- `pnpm test:integration` runs Vitest over every project, selecting `integration.test` files. A
  project without any still passes because of `--passWithNoTests`.
- `pnpm test:e2e` names the one suite directly (`pnpm --filter @fphd/e2e run test:e2e`), so broken
  e2e wiring is an error rather than a silent skip. In CI the job is a matrix of shards, each
  running `--shard=i/n`: every shard runs the four apps as compose containers from the production
  images the image build job made (see [Container images](#container-images)), seeds the database
  with the same commands a developer runs, runs its share of the suite, and uploads its own
  Playwright report when it fails. Add a shard to the matrix as the suite grows.

Both tiers are one root Vitest run over the projects declared in `vitest.config.ts`, globbed from
`apps/*`, `packages/*` and `tools/*`. Packages declare no test scripts of their own, so a new
package joins both tiers by existing rather than by remembering to opt in. Target one from the root:

```sh
vitest run --project @fphd/public-api        # one package
vitest run apps/public-api/src/app.test.ts   # one file
vitest run -t 'partial test name'            # one test
```

To add real ones:

- An integration test is any file whose name contains `integration.test`, colocated in `src/` like
  a unit test. Conventionally that is `<subject>.integration.test.ts`, but neither the prefix nor
  the extension is part of the contract, so `.integration.test.tsx` and a bare `integration.test.ts`
  both qualify. The two tiers are the same run under different filters — `test:unit` excludes that
  pattern and `test:integration` selects it — so a package needs no per-tier wiring.
  The integration job has Postgres and Azurite services and creates the per-API login roles. The root
  Vitest global setup (gated on `INTEGRATION_DB=1`, set by `test:integration`) builds a
  migrated, seeded template database once per run; each test file calls
  `createTestDatabase()` from `@fphd/db/testing` for its own copy, so files run in parallel
  against isolated databases and never touch the development database.
- E2e tests are Playwright specs in the top-level `e2e` workspace package (`@fphd/e2e`), not in
  `packages/*`: a package there is shared code the applications are built from, which an e2e suite
  is not. Specs drive the applications over HTTP and never import application code; the spec's
  directory picks the target — `e2e/tests/public` uses `PUBLIC_WEB_URL` (default
  `http://127.0.0.1:3000`), `e2e/tests/internal` uses `INTERNAL_WEB_URL` (default
  `http://127.0.0.1:3001`). Nothing starts the stack for the suite: serve it in another terminal
  and seed the database, then run the tests —

  ```sh
  pnpm --filter @fphd/e2e exec playwright install chromium   # once
  pnpm dev                                                   # or any dev:mixed split
  pnpm test:e2e
  ```

  `pnpm --filter @fphd/e2e exec playwright test --ui` opens UI mode, and `--headed` and `-g`
  filters pass through the same way. Specs run in parallel workers against the shared seed, so a
  spec never mutates data another spec reads — a test of a write flow creates its own rows and
  asserts on those.

  Internal specs start signed in. The `internal sign-in` setup project
  (`e2e/tests/internal/sign-in.setup.ts`) signs each internal user in once a run and saves the
  session under `e2e/.auth`, and a spec picks one with
  `test.use({ storageState: PUBLISHER.storageState })` (or `ADMIN`). Only the specs that test
  signing in, and the access-denied spec, drive the sign-in form.

  Every page has a spec with a test that it renders and a separate test that it has no WCAG 2.2 AA
  violations, scanned with axe-core through `expectNoAccessibilityViolations` from
  `e2e/tests/support/accessibility.ts`; a new page gets a spec with both, and
  `pnpm check:e2e-coverage` (below) fails until it does. A spec that drives a page
  into a further state — a validation error, a selection — scans that state too. A ticketed defect
  that is waiting on a fix goes in `KNOWN_VIOLATIONS` in the same file, scoped to one rule and one
  selector so the rest of the page is still held to the bar; the scan also checks each entry is
  still seen, so the fix landing without removing it goes red. Automated checks catch around a third
  of WCAG issues, so this is a regression net rather than an audit: keyboard operation, zoom and
  reflow, and screen-reader behaviour still need manual testing.

Every job runs the whole workspace rather than only the changed packages. When CI wall-clock starts
to hurt, `pnpm --filter "...[origin/main]"` selects changed packages plus their dependents, with no
extra tooling. Two caveats: it needs `fetch-depth: 0` on checkout, and it understands only the
dependency graph — a change to a root file such as `tsconfig.base.json` or `biome.json` selects
nothing, so it needs a full-run fallback. Filter inside the job with pnpm rather than with
workflow-level `paths:` filters, which produce skipped jobs that branch protection reads as
satisfied.

## E2e coverage of new work

Two checks keep the e2e tier growing with the apps. Neither is a coverage percentage: a threshold
is met by visiting pages without asserting anything.

`pnpm check:e2e-coverage` (`tools/e2e-coverage`, also its own CI job and the last step of
`pnpm check`) reads both apps' route tables through `react-router routes --json` and fails, naming
the route, when a page route has no spec. The route-to-spec mapping is spelt out in
`tools/e2e-coverage/src/specs.ts` rather than derived from the path, so adding a page means adding
the route there and the spec under `e2e/tests/public` or `e2e/tests/internal`; a group of routes
that make one journey can share a spec, as the `manage/topics/*` routes do. A route whose module
has no default export is a resource route by React Router's own definition — a data lookup, a CSV
download, a redirect — and needs no spec, since it has no page; the check reads each route module
to tell the two apart. It also fails a mapping entry no app declares any more, and a spec file
that never calls `expectNoAccessibilityViolations`, since one axe scan per page state is the
convention above. A spec that only resource routes map to, such as one covering where a redirect
lands, is exempt from the scan; the mapped spec must still exist, since the entry is what
exempts it.

The `Web changes carry e2e changes` CI job covers the gap the route check cannot see: new behaviour
on an existing page. A pull request that changes `apps/*-web`, `packages/*-web-features`,
`packages/ui`, `packages/utils`, `packages/web-server` or `packages/auth` without touching `e2e/` fails until it carries the `no-e2e-needed` label and a line in its body reading
`No e2e needed: <reason>`. The job reads the label and body live rather than from the event that
started the run, so adding them and re-running the failed job is enough. It is blunt by design — a
copy change earns the label with a one-line reason — because the point is that the reviewer sees
the "why not".

Behaviour rather than pages is covered by convention, not tooling: the pull request for a story adds
one e2e test per acceptance criterion, titled in the criterion's words, and the reviewer checks the
story against the spec titles.

## The public artifact boundary

`pnpm check:artefacts` (`tools/artefact-boundary`, also its own CI job) fails if internal code or a
repository secret has reached a public artifact, or the database operations a server app. It
applies six checks, cheapest first so the common failure is reported without waiting for a build:

- no reference to the `secrets` context can reach a `docker build` step in any workflow — not in
  the step's `run`, `with` or `env`, and not in `env` inherited from its job or the workflow. The
  images are public, so a secret passed as a build arg is a secret published; the Trivy secret
  scan in CI inspects the built layers for the patterns it knows, and this refuses the route
  whatever the value looks like;
- the two public apps' transitive workspace dependency closures contain no `internal-*` package;
- the four server apps' closures do not contain `@fphd/db-operations`, so only the operations
  image carries the migrations, seeding and the core data import;
- no route module in `public-web`'s route table is internal. React Router declares routes as path
  strings rather than imports, so `route('manage', '../../packages/internal-web-features/…')` is
  invisible to an import linter — `react-router routes --json` names those paths directly;
- no import specifier in `apps/public-api/dist` resolves to internal code — this is the one that
  catches a deep relative import, which never appears in a `package.json`;
- no module in the `public-web` bundle comes from an internal package. The bundle is minified, so
  module identity survives only in sourcemaps. The check builds with `--sourcemapClient hidden
  --sourcemapServer hidden`, reads each map's `sources` across `dist/client` and `dist/server`, then
  deletes the maps: `hidden` omits the `sourceMappingURL` comment that would point at them, so what
  remains in `dist/` is byte-identical to a plain `react-router build`. React Router prints a
  "source maps are enabled in production" warning during this build; it does not apply to what
  ships, because the maps do not survive the check.

The rule the four code checks share is "a module reference naming an `@fphd/internal-*` package or
living under a directory named `internal-*`", unit-tested in
`tools/artefact-boundary/src/internal.test.ts`. The build-input check is unit-tested in
`tools/artefact-boundary/src/builds.test.ts`, and the operations rule in
`tools/artefact-boundary/src/operations.test.ts`.

Three of the checks would pass vacuously if they silently found nothing to inspect, so all refuse
to: no workflow building an image is an error, an app name absent from the workspace refuses to be
checked rather than yielding an empty closure, and a `dist` holding no JavaScript or no sourcemaps
is an error, not a pass.

Some vectors are caught earlier than this gate: TypeScript's `rootDir` rejects a relative cross-app
import at compile time, and Biome's `noRestrictedImports` rejects one by package name. The artifact
checks are the backstop for what those cannot see, and the only thing that inspects what actually
ships.

## Database

A PostgreSQL 18 container defined in `compose.yaml`, for local development only — it is not
deployed.

```sh
pnpm services:up          # start and wait for healthy — what the dev scripts run
docker compose up -d      # start without waiting
docker compose down       # stop
docker compose down -v    # stop and delete all data
```

`pnpm services:up` starts every compose service that carries no `profiles:` key, so a service added
to `compose.yaml` without a profile becomes a dev prerequisite without the script changing. The four
app services are profile-gated and belong to `pnpm dev:mixed`.

Each API connects with its own login role (`public_api`, `internal_api`) rather than as the owner,
so access can be constrained per audience at the grant level. The roles are created by
`pnpm db:bootstrap` — run it once against a fresh database, before the first migration: the grant
migrations reference the roles, so migrating a database that has never been bootstrapped fails.
It is idempotent, and it sets the passwords every time, so re-running it is also how a password
change in `.env` reaches the database.

The Drizzle schema lives in `packages/db` and its migrations in `packages/db-operations`:

```sh
pnpm db:generate              # generate a migration from the schema
pnpm db:migrate               # apply pending migrations
pnpm db:import-core-data      # load required core data (topics and lists) — idempotent, any environment
pnpm db:seed-dummy-data       # replace dummy data with the committed seed and rebuild read models
pnpm db:rebuild-read-models   # rebuild the derived cache tables from the published views
pnpm db:migrate-live-data     # apply a live data migration package (DATA_MIGRATION_URL/_SHA256)
pnpm db:reset                 # back to a freshly created database, for db:migrate to rebuild
pnpm db:studio                # browse the database
```

The schema implements the bridge/registry canonical model ratified in ADR023: governed
registries for dimension types and values, observations linked to dimension values through
bridge records, and derived read-model tables rebuilt from the published views of it. Surrogate
keys are UUIDv7 (native `uuidv7()` default in PostgreSQL 18); the public indicator
number lives in `indicator.short_id`, carried over from Fingertips where there was one
and minted by a sequence otherwise. Grants are explicit: `public_api` reads only the
published surface (not `upload_batch`), `internal_api` additionally reads and writes the
publisher's tables and upload state, and a table added by a future migration gets no access
until granted deliberately.

The schema's layout, naming conventions and the add-a-table checklist are documented in
[`packages/db/README.md`](packages/db/README.md), and the migrations and the core data import's
semantics in [`packages/db-operations/README.md`](packages/db-operations/README.md).

A fresh database is ready for development with:

```sh
pnpm services:up && pnpm db:bootstrap && pnpm db:migrate && pnpm db:import-core-data && pnpm db:seed-dummy-data
```

The dev scripts start the database but deliberately do not migrate it: applying migrations is not
something that should happen as a side effect of running the apps. So a first run — or any run after
`docker compose down -v` — needs the command above before the pages have data.

The seed is real Pholio data for 12 indicators and the prototype's geography catalogue,
committed as gzipped CSVs — see `packages/db-operations/data/seed/README.md` for what is in it
and how to regenerate it.

## Graceful shutdown

On SIGTERM or SIGINT every server drains, closes, then cleans up — releasing the database pool, and
Vite in dev. `SHUTDOWN_GRACE_PERIOD_MS` (default 25s) is the budget for all three rather than a
timeout per phase, so it is directly comparable to Container Apps' `terminationGracePeriodSeconds`
and must stay under it, since that is what decides when SIGKILL arrives. It is a ceiling and not a
wait: a stop with nothing in flight is immediate. `SHUTDOWN_DRAIN_MS` is how long the server goes on
serving while readiness fails, giving the ingress time to stop routing here; it comes out of the
budget rather than adding to it, and is zero locally, five seconds elsewhere.

All four apps serve the same two probes, so one configuration covers every app: `/livez` stays 200
throughout a stop, `/readyz` answers 503 with `"status": "draining"` from the moment a signal
arrives.

## Operational commands

`apps/operations` is a command-line application for work done *to* a deployed environment rather
than by it. The `pnpm db:*` scripts above cover a developer machine, where the database is a
container on localhost and drizzle-kit is installed; neither is true of a managed server, which has
no public endpoint and can only be reached from inside its network. This is what runs there, as a
job:

```sh
pnpm --filter @fphd/operations cli db bootstrap             # create the per-API login roles
pnpm --filter @fphd/operations cli db migrate               # apply pending migrations
pnpm --filter @fphd/operations cli db status                # report migration state; non-zero if blocked
pnpm --filter @fphd/operations cli db import-core-data      # load required core data (topics)
pnpm --filter @fphd/operations cli db seed-dummy-data       # replace all dummy data with the seed
pnpm --filter @fphd/operations cli db import-published-snapshot # dev only: load a verified published benchmark archive
pnpm --filter @fphd/operations cli db migrate-live-data       # apply a live baseline or increment
pnpm --filter @fphd/operations cli db rebuild-read-models
pnpm --filter @fphd/operations cli db reset                 # dev-class only: drop all schema objects
```

The `pnpm db:*` root scripts for these are thin wrappers over the same commands, so local and
deployed run one engine. A first run — local or deployed — is `bootstrap` → `migrate` →
`import-core-data` → `seed-dummy-data`; a dev-only rebuild from empty is `reset` → `migrate` →
`import-core-data` → `seed-dummy-data`.

Deployed, the same commands are `node dist/cli.js db migrate` and so on, in the `operations` image.
That image also carries `psql`, because a database with no public endpoint makes a container inside
the network the only route to an ad-hoc query. It is version 18, matching the server — `pg_dump`
refuses to run against a server newer than itself.

These commands are worth noting:

- `db bootstrap` is the only bootstrap path: the local compose database (via `pnpm db:bootstrap`),
  CI's integration job and a managed server all create the per-API roles through it. It is
  idempotent — safe against a server where the roles already exist — and it sets the passwords
  every time, so it is also how a credential is rotated.
- `db import-core-data` loads the required starting data the service relies on from
  `packages/db-operations/data/`: topics, the classifications indicators are tagged with, and the
  lists a publisher chooses from — CI methods, data providers, value types, units and comparator
  methods. It is idempotent (upserts keyed on stable ids, rows absent from the file are reported
  rather than deleted) and runs in any environment: this is permanent content preview and
  production need, not dummy data.
- `db seed-dummy-data` replaces the dummy data — the committed indicators, observations and the
  links tying those indicators to topics — and rebuilds the read models, in one command and one
  transaction. A job runs one command, and a seeded database whose read models are still empty
  serves an empty site. It refuses to run unless `APP_ENV` is `local`, `test` or `dev`, and fails
  if the core data has not been imported: no topics, CI methods or data providers, or any
  classification, value type, unit or comparator method whose id its file holds missing from the
  database. Dummy data may depend on core data, never the reverse. The core-data tables are left
  alone.
- `db import-published-snapshot` replaces the dev seed with the `PHOLIO_LIVE_B`
  development snapshot built by `export-dev-snapshot` in
  [the migration tool](tools/data-migration/README.md). Set `PUBLISHED_SNAPSHOT_URL`
  to its private HTTPS archive and `PUBLISHED_SNAPSHOT_SHA256` to its checksum.
  The command verifies source lineage, recorded counts, tidied reference names and
  every table checksum, applies provisional demo topic links and rebuilds the read
  models in one transaction. It has the same dev-only gate as seeding. It locks
  canonical tables during loading, so run it when a beta interruption is acceptable.
  This development corpus is separate from the approved production indicator list.
- `db migrate-live-data` applies a checksum-verified approved-live baseline to empty
  canonical tables, or the next incremental package in its recorded predecessor chain.
  It applies reviewed topic and classification relationships, rebuilds the read models and
  records the package in `data_migration` in one transaction. Publisher writes to indicators,
  versions, topic assignments and classification assignments wait until the transaction finishes.
  Version batch pointers are connected after the batches load, allowing their mutual references
  and batch replacements. Versions being withdrawn have their batch pointers cleared before
  either row is deleted. Packages name their writer `pholio-migration`, which the import loads as
  the PHOLIO migration user, so imported versions and batches carry that user's id. A baseline's
  indicators join the Fingertips team, as does any indicator an increment adds without a team.
  Increments stop and roll back when a migrated indicator has an FPHD draft or a publisher
  publication or edit; resolve that conflict before retrying. FPHD-only published indicators are
  outside the migration's relationship coverage and keep their topics, classifications and answers.
  Batch, observation and observation attribute changes check both incoming and existing owners
  before writing, including withdrawals. A version cannot move to another indicator. Relationship
  updates leave historical versions unchanged.
  The manifest's `source_csv_null` describes the source export only: prepared package CSVs
  use unquoted empty fields for SQL NULL and quoted empty fields for empty strings.
- `db reset` returns the database to its freshly created state (recreating the `public` schema
  and dropping the migration watermark) so `db migrate` rebuilds from empty — recreate rather than
  truncate, so it also recovers from a broken migration state. It refuses outside
  `local`/`test`/`dev` and never touches database roles.

`db bootstrap` needs `PUBLIC_API_PASSWORD` and `INTERNAL_API_PASSWORD`; the other commands do not,
and fail naming them rather than requiring every job to hold role passwords. All of them connect as
the owner role (`POSTGRES_USER`/`POSTGRES_PASSWORD`), not as a per-API role.

### Invoking them from a deployed environment

Deployment lives in the infrastructure repository, which owns the jobs that call these. Command
`node dist/cli.js <command>`:

```sh
db bootstrap             # additionally needs PUBLIC_API_PASSWORD and INTERNAL_API_PASSWORD
db migrate
db status
db import-core-data
db seed-dummy-data
db import-published-snapshot # dev only; requires the two PUBLISHED_SNAPSHOT_* values
db migrate-live-data       # requires DATA_MIGRATION_URL and DATA_MIGRATION_SHA256
db rebuild-read-models
db reset
```

Required environment, for every command:

```sh
APP_ENV                  # dev | preview | production for a deployed job; no default, so an
                         # unset value fails the job rather than relaxing TLS in silence
DB_HOST
POSTGRES_DB
POSTGRES_USER            # the owner role, not a per-API role
POSTGRES_PASSWORD
```

`DB_PORT`, `DB_TLS` and `LOG_LEVEL` are optional. Exit codes: `0` success, `1` failure, `2`
unrecognised command.

## Container images

`docker/Dockerfile` builds the production images — one per deployable application, plus
`operations`. A shared builder stage installs and builds the whole workspace; then `--target` picks
the runtime shape and `--build-arg APP` picks the app:

```sh
docker build -f docker/Dockerfile --target web --build-arg APP=public-web   -t public-web   .
docker build -f docker/Dockerfile --target web --build-arg APP=internal-web -t internal-web .
docker build -f docker/Dockerfile --target api --build-arg APP=public-api   -t public-api   .
docker build -f docker/Dockerfile --target api --build-arg APP=internal-api -t internal-api .
docker build -f docker/Dockerfile --target operations --build-arg APP=operations -t operations .
```

Five images, three targets. The two web apps have identical runtime stages — same base, same
init, same start command — and so do the two APIs; only *which* app the builder compiled into
the image differs. A per-app target would be a copy with nothing changed in it, so the targets
split only where the runtime genuinely does: `dist/server.js` for an API, `server.ts` for a web
app, and the CLI-plus-`psql` image for operations.

`pnpm deploy --prod --legacy` prunes devDependencies and copies only the workspace packages the app
actually depends on, so no image carries pnpm, TypeScript, drizzle-kit or another app's code.
`--legacy` is required because the current implementation expects injected workspace packages, which
this workspace does not use. Images run as the `node` user and start under tini, which guarantees
SIGTERM is delivered to a process running as PID 1 — the kernel discards a default-action signal
sent to PID 1 unless that process installed a handler. Every server stops gracefully on that
signal, well inside a thirty-second grace period. `HOST` and `PORT` come from the environment,
defaulting to `0.0.0.0` and the app's own port.

This is separate from `docker/app.Dockerfile`, which is the development image used by
[mixed local/Docker development](#mixed-localdocker-development) and keeps the whole workspace and
its devDependencies — exactly what the production images must not do.

On a pull request, CI builds the four server images in one `docker buildx bake` run from
`docker/docker-bake.hcl`, so the shared builder stage runs once. It smoke-tests them, checks their
contents with `scripts/check-image-contents.sh` and saves them as an artifact. The contents check
fails if an image carries TypeScript, or if a server image carries `@fphd/db-operations`, a `.sql`
or `.csv.gz` file or a drizzle config; for the operations image it requires every migration the
journal lists, the core data and the seed. The e2e job loads that artifact and runs the suite
against the images, with `compose.e2e.yaml` layered over `compose.yaml` to swap each service's
build for its image, and a scan job per image runs Trivy on the same images alongside it. The
operations image, which e2e does not use, is built, smoke-tested, contents-checked and scanned in
a job of its own.

`.github/workflows/publish-images.yml` builds all five on every push to `main` and pushes them to
GitHub Container Registry under the repository that ran it —
`ghcr.io/<owner>/find-public-health-data/fphd-<app>`, lowercased — tagged with the commit SHA and
`latest`. The `fphd-` prefix groups the five in the organisation's package list. OCI labels carry
the repository, commit and build time rather than encoding them in the tag. There is no registry
credential on either side: the workflow authenticates with its own run-scoped `GITHUB_TOKEN`, and
the packages are public, so deployments pull anonymously. GHCR does not reliably create a new
package public, so check a brand-new package's visibility in its settings after its first push; a
private one cannot be pulled anonymously.

Write access to the packages is repository access: they are linked to this repository on that first
push and inherit its permissions, so anyone with maintain or admin here can push to them, from any
workflow on any branch or with a personal token. The `main`-only trigger is a convention of this
workflow, not something the registry enforces. What keeps a stray push away from a deployment is
the digest pin below — a new tag changes nothing until someone updates the infrastructure repository.

**Deploy by digest, not by tag.** Both tags are labels for people; neither is a stable reference to
particular bits. GHCR tags are mutable, and re-running the workflow for a commit already published
necessarily builds a different manifest — the `created` label alone guarantees it — which then
overwrites both tags. A replica scaling up afterwards against the same tag can get different code
from the one already running. Each run therefore prints the pushed digest to its summary:

```
ghcr.io/<owner>/find-public-health-data/fphd-public-web@sha256:4f30b957…
```

That is what a revision should reference, and what `app_images` in the infrastructure repository
should be set to. Deploys are manual for now, so the summary is where to copy it from.

Trivy scans each image between building and pushing, and a fixable high or critical vulnerability
in an operating system package stops it reaching the registry. That layer is otherwise unscanned —
CodeQL reads the source and CI's audit job resolves the npm tree from the lockfile, and neither
looks at the Alpine packages underneath, which is also why the scan covers OS packages only. The
base image is pinned by digest and raised by Dependabot, and the runtime stage runs `apk upgrade`,
so a red scan means a fix apk could not deliver rather than a stale pin. The pin names its Alpine
release (`24-alpine3.24`) rather than using the floating `24-alpine` alias, so a Dependabot digest
bump cannot move the base to a new Alpine release — and everything the operations image installs
by name — without anyone choosing to.

A second Trivy pass scans each image for secrets — in its files and, with
`TRIVY_IMAGE_CONFIG_SCANNERS=secret`, in its config and layer history, which is where a build arg
or `ENV` lands. It is a separate step because the vulnerability scan's `HIGH,CRITICAL` floor would
drop the generic credential patterns Trivy rates lower. CI runs the same scan on every pull
request, and `check:artefacts` refuses any workflow that lets a repository secret reach `docker
build` at all, so this step should never be the first to notice.

## Mixed local/Docker development

Any subset of the four applications can run as Docker containers while the rest run locally.
`pnpm dev:mixed` takes the apps to run **locally** and starts everything else (plus the database) as
containers:

```sh
pnpm dev:mixed internal-api                 # internal-api local; other three in containers
pnpm dev:mixed internal-web internal-api    # internal pair local; public pair in containers
pnpm dev:mixed public-web internal-web      # both webs local; both APIs in containers
```

The script behind it is `scripts/dev.sh`, which can be run directly with the same arguments.

Ctrl-C stops the local apps and the app containers; the database stays up. Running all four locally
is just `pnpm dev`.

Each app service in `compose.yaml` sits behind a profile of the same name, so plain
`docker compose up` still starts only the database and Azurite. The containers are built by
`docker/app.Dockerfile` from the current working tree and run the app's **production build**
(`pnpm build` output via `pnpm start`) — no file watching, no bind mounts. They are rebuilt each
time the script starts (cheap when nothing changed, thanks to layer caching), so a container picks
up source changes on the next start, not live.

Every app is reachable on the host at its canonical port (3000/3001/4000/4001) whether local or
containerised, because containers publish those ports. Any URL by which one app reaches another
must be env-driven with a localhost default; a containerised app overrides it with
`host.docker.internal:<port>`, which reaches whatever runs behind that port on the host — local
process or published container alike. This one rule is what makes every combination work without
per-combination configuration. (The APIs' database connection is the exception: containerised APIs
reach Postgres directly over the compose network via `DB_HOST=db`, and a containerised
internal-api reaches Azurite there too.)

## Structure

`apps/*` hold deployment wiring, routes and entrypoints, and never import one another — reusable
business and feature logic belongs in `packages/*`. `tools/*` holds workspace members that support
the build rather than ship in it. `apps/operations` is the exception: an application like the other
four, but it serves no traffic — see [Operational commands](#operational-commands).

Each package has a README describing its purpose and entry points:

| Package                                                          | Purpose                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| [`@fphd/api-server`](packages/api-server/README.md)              | The Express app both APIs are built from                        |
| [`@fphd/auth`](packages/auth/README.md)                          | Audiences, fake users and the JWT session cookie                |
| [`@fphd/config`](packages/config/README.md)                      | Environment parsing fragments and the shared zod instance       |
| [`@fphd/db`](packages/db/README.md)                              | Schema, client and the repositories the APIs read through       |
| [`@fphd/db-operations`](packages/db-operations/README.md)        | Migrations, bootstrap, imports, seed data and reset             |
| [`@fphd/express`](packages/express/README.md)                    | The base Express app and middleware every server shares         |
| [`@fphd/internal-api-features`](packages/internal-api-features/README.md) | Routes and queries only the internal API runs          |
| [`@fphd/internal-storage`](packages/internal-storage/README.md)  | Blob Storage for uploaded files, kept out of the public images  |
| [`@fphd/internal-web-features`](packages/internal-web-features/README.md) | Pages and loaders only the internal web app mounts     |
| [`@fphd/logger`](packages/logger/README.md)                      | pino, configured once                                           |
| [`@fphd/public-api-features`](packages/public-api-features/README.md) | The public API routes and their wire contract              |
| [`@fphd/public-web-features`](packages/public-web-features/README.md) | The public site's pages and loaders                        |
| [`@fphd/ui`](packages/ui/README.md)                              | Shared React components and styles                              |
| [`@fphd/utils`](packages/utils/README.md)                        | Side-effect-free helpers shared by Node and the browser: slugs, short ids, indicator paths |
| [`@fphd/web-server`](packages/web-server/README.md)              | The Node host for the web apps and their server-side plumbing   |
