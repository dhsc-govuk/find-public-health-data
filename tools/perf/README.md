# Route budgets

For concurrent tests against an existing dataset, use the separate read-only command:

```sh
pnpm perf:load --base-url http://127.0.0.1:3000 \
  --path /topics/cancer \
  --path /indicator/under-75-mortality-rate-from-all-causes \
  --concurrency 1,4,8 --rounds 3 --output /tmp/full-load.json
```

This only sends GET requests. It warms each route once, then records at least six requests per route
and concurrency level. Add `--mixed` to distribute each level's requests across the routes. The
report includes every sample, failures, time to headers and time until the entire streamed response
has been consumed. It uses a browser user agent so the initial shell can stream. These are local
server response timings; measure browser rendering separately. A failed response, stream or section
fails the command. It does not prepare fixtures or connect to the database. Use `--skip-warmup`
immediately after restarting the apps to check their first requests.

To check mobile sections while seven clients each fetch a page three times, and then check that
desktop tabs switch without data requests:

```sh
pnpm perf:load --base-url http://127.0.0.1:3000 \
  --path /indicator/under-75-mortality-rate-from-all-causes \
  --path /topics/diabetes \
  --concurrency 7 --rounds 3 --navigation --output /tmp/navigation-load.json
```

`--navigation` opens Chromium alongside the HTTP traffic for each level. It waits for every mobile
section's table, checks the loading messages disappear, and exercises desktop tabs. The report adds
the time until all mobile tables are visible and any browser failure. Install the browser once with
`pnpm --filter @fphd/perf exec playwright install chromium`. This mode accepts topic and indicator
detail pages with data in every section.

## Seeded budgets

`pnpm check:perf` requests a set of read-only routes across the four apps on the seeded stack and
checks, for each, how much work one request costs and how long requests take. CI runs it in the
`Route budgets` job on every pull request, beside e2e and against the same production images.

FPH-662 starts with main's baseline and remeasures the seven topic pages and three indicator pages
affected by charts. The 13 November 2026 measurements use local production builds on Node 26.13.0
and an isolated PostgreSQL 18.4 database with the CI seed, performance fixtures and
`compose.perf.yaml` settings. Each route has 18 warm-up requests, a complete-table check and two
counted samples with identical statement, buffer and row counts. Unchanged routes retain main's
values; the CI route-budget job still checks the production images.

Highlighted sparklines need eight periods, including null gaps, whereas the existing read model
stores five non-null trend points. Indicator charts add their table fallbacks and a compact matrix
of the latest area observations.

The comparison first moved from 98 to 36 statements, but its extra history read increased buffers
and real-data latency. The current loader reuses the two compact ranking results when they provide
an unambiguous latest pair. Incompatible population segments need no history read. A differing
period, disjoint latest areas or ambiguous sex headline uses one bounded series-ID query that elects
the same population and latest common local period on the server. It returns only that period's area
values. Missing markers, stale IDs, duplicate historical area codes and tied headline segments
retain the canonical fallback and the cache's observation ordering.

The seeded comparison now costs **34 statements, 48,821 buffers, 4,514 rows and 483,073 bytes**.
Main's corresponding values are **35 / 47,010 / 4,515 / 428,972**: buffers are 3.85% higher, rows
are slightly lower, and the byte difference includes the existing chart features. This pass started
at 36 / 59,601 / 9,177 / 483,073 on the same isolated database. The earlier 59,070-buffer capture is
preserved in the previous measurement report.

Migration `0079_cache-sparkline-periods`, generated with `pnpm db:generate`, adds nullable
`sparkline_observation_ids` and extends the published series view. The read-model builder stores
eight periods per elected series and period shape, including null gaps. Sparkline reads hydrate
those IDs alongside the existing trend points and benchmarks. Until a cache is rebuilt, null ID
arrays use canonical history. Deployments should rebuild the read models after the migration. The
cached and canonical paths retain the existing series election and table metadata.

The mortality topic's public and internal data/areas routes now cost **51 statements, 3,992 buffers
and 1,582 rows**, compared with this pass's 52 / 14,515 / 1,733 and the branch CI reference of
14,273 buffers (17,147 including tolerance). CI's reported 17,211-buffer run is a separate capture.
The expensive `readSparklineHistory` window statement is removed from reads. Replaying the old and
new point hydration queries returned identical IDs and values: **151 seed points and 3,050 real-data
points**. The eight-period, null-gap, mixed-period and pre-rebuild fallback tests also pass.

Every route below used production builds, an isolated PostgreSQL 18.4 seed with the CI settings, 18
warm-up requests, complete-table checks and `tools/perf/src/measure.ts`. All counted samples are
retained in [the measurement report](measurements/2026-11-13-total-work.json). Values are
**statements / buffers / rows / bytes**. Main was fetched from the repository's main branch; its
topic baseline is 104,542 buffers, while this worktree's topic CI baseline is 14,273. A dash means
main has no budget entry for that supplementary internal route.

| App / route                                                                                                            | Main                            | Before this pass              | After                         |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------- | ----------------------------- |
| `public-web /topics/diabetes`                                                                                          | 63 / 85,813 / 23,971 / 158,350  | 54 / 7,574 / 1,428 / 162,447  | 53 / 3,624 / 1,372 / 162,514  |
| `public-web /topics/mortality-and-life-expectancy?tab-topic=data`                                                      | 55 / 104,542 / 22,613 / 179,062 | 52 / 14,515 / 1,733 / 187,932 | 51 / 3,992 / 1,582 / 187,946  |
| `public-web /topics/mortality-and-life-expectancy?tab-topic=areas`                                                     | 55 / 104,542 / 22,613 / 179,066 | 52 / 14,515 / 1,733 / 187,950 | 51 / 3,992 / 1,582 / 187,950  |
| `public-web /topics/mortality-and-life-expectancy?tab-topic=data&sort=trend-desc`                                      | 57 / 163,967 / 22,619 / 179,896 | 54 / 14,543 / 1,739 / 188,507 | 53 / 4,020 / 1,588 / 188,507  |
| `public-web /topics/mortality-and-life-expectancy?tab-topic=data&sort=period-desc`                                     | 55 / 112,537 / 22,613 / 179,707 | 52 / 23,178 / 1,733 / 188,280 | 51 / 12,655 / 1,582 / 188,280 |
| `public-web /topics/mortality-and-life-expectancy/table.csv?tab-topic=areas`                                           | 54 / 64,926 / 23,954 / 3,900    | 24 / 2,844 / 628 / 1,345      | 24 / 2,694 / 628 / 1,345      |
| `public-web /indicator/diabetes-qof-prevalence?tab-indicator=compare&find=mortality`                                   | 18 / 37,064 / 2,587 / 352,544   | 18 / 37,964 / 2,587 / 408,853 | 18 / 38,044 / 2,587 / 408,853 |
| `public-web /indicator/diabetes-qof-prevalence`                                                                        | 17 / 37,103 / 2,583 / 350,033   | 17 / 37,937 / 2,583 / 406,046 | 17 / 38,017 / 2,583 / 406,046 |
| `public-web /indicator/diabetes-qof-prevalence?tab-indicator=compare&compareWith=smoking…&as=E07000223&as=E07000032`   | 35 / 47,010 / 4,515 / 428,972   | 36 / 59,601 / 9,177 / 483,073 | 34 / 48,821 / 4,514 / 483,073 |
| `public-web /indicator/diabetes-qof-prevalence/table.csv`                                                              | 10 / 8,882 / 2,652 / 569        | 10 / 2,879 / 1,387 / 573      | 10 / 2,879 / 1,387 / 573      |
| `internal-web /topics/diabetes`                                                                                        | —                               | 54 / 7,574 / 1,428 / 164,891  | 53 / 3,624 / 1,372 / 164,891  |
| `internal-web /topics/mortality-and-life-expectancy?tab-topic=data`                                                    | 55 / 104,542 / 22,613 / 182,115 | 52 / 14,515 / 1,733 / 190,330 | 51 / 3,992 / 1,582 / 189,785  |
| `internal-web /topics/mortality-and-life-expectancy?tab-topic=areas`                                                   | 55 / 104,542 / 22,613 / 182,119 | 52 / 14,515 / 1,733 / 190,334 | 51 / 3,992 / 1,582 / 190,334  |
| `internal-web /topics/mortality-and-life-expectancy?tab-topic=data&sort=trend-desc`                                    | —                               | 54 / 14,543 / 1,739 / 190,891 | 53 / 4,020 / 1,588 / 190,348  |
| `internal-web /topics/mortality-and-life-expectancy?tab-topic=data&sort=period-desc`                                   | —                               | 52 / 23,178 / 1,733 / 190,664 | 51 / 12,655 / 1,582 / 190,720 |
| `internal-web /topics/mortality-and-life-expectancy/table.csv?tab-topic=areas`                                         | —                               | 24 / 2,844 / 628 / 1,345      | 24 / 2,694 / 628 / 1,345      |
| `internal-web /indicator/diabetes-qof-prevalence?tab-indicator=compare&find=mortality`                                 | —                               | 18 / 37,964 / 2,587 / 411,352 | 18 / 38,044 / 2,587 / 411,352 |
| `internal-web /indicator/diabetes-qof-prevalence`                                                                      | —                               | 17 / 37,937 / 2,583 / 408,547 | 17 / 38,017 / 2,583 / 408,547 |
| `internal-web /indicator/diabetes-qof-prevalence?tab-indicator=compare&compareWith=smoking…&as=E07000223&as=E07000032` | —                               | 36 / 59,601 / 9,177 / 485,587 | 34 / 48,821 / 4,514 / 485,587 |
| `internal-web /indicator/diabetes-qof-prevalence/table.csv`                                                            | —                               | 10 / 2,879 / 1,387 / 573      | 10 / 2,879 / 1,387 / 573      |

The real-data mortality/cancer comparison on `fphd:5433` preserves all **152 scatter points at
2025**. On production ports 3961/13961, four warm-ups and 15 sequential full-response requests
measured median **277.90 → 125.77 ms** and p95 **286.82 → 139.58 ms**. The original reference was
233.81 / 260.44 ms. A retained noisy after-only run during background indexing measured 255.33 /
450.81 ms. The back-to-back replay of the pre-pass scatter module and parallel loader graph measured
285.18 / 298.89 ms, followed by the unmodified after build at 125.77 / 139.58 ms. The process-local
replay hook and saved module are included with the plan captures; it changes no repository files.
All samples from these captures are retained.

[Full EXPLAIN (ANALYZE, BUFFERS) captures](measurements/2026-11-13-total-work-explain.json.gz) cover
ranking reads, the old extra scatter read, the single-period fallback and sparkline reads on seed
and real data. The report gives each statement's rows, buffers and execution time. The
matching-period page executes no extra scatter statement. The real heavy fallback returned 304 rows
instead of 9,120; the real topic window read previously touched 55,753 buffers and is absent from
the cached path. Internal read-only measurements use the compiled API app with an injected storage
adapter that fails if called, keeping Azurite off outside integration tests.

Validation passed sequentially: Biome (one existing SCSS warning), type checking, migration drift,
4,669 TypeScript and 106 Python unit tests, 1,316 integration tests with two workers, production
builds, e2e coverage and all 60 indicator/topic browser tests. All started servers and the isolated
database are stopped after verification; the existing playground PostgreSQL remains running.

The routes are in [`src/routes.ts`](src/routes.ts): the common pages of both web apps and the
heaviest API queries behind them, such as GP-practice ranges and multi-area data for the largest
indicator in the seed. Internal routes are requested as the fake admin user.

The seed has no drafts, so before measuring the script adds one with a loaded data table of about
105,000 rows ([`src/fixtures.ts`](src/fixtures.ts)) for the data table check page and the API behind
it. It is dated in the past, so the dashboard lists it last, and is deleted once the routes are
measured. The draft uses current areas referenced by seed observations, keeping its size stable as
the core reference catalog grows.

## What is measured

For one request to each route, after warm-up and timed requests have warmed the API connection
pools:

| Metric       | Source                                                        |
| ------------ | ------------------------------------------------------------- |
| `statements` | SQL statements the APIs executed (`pg_stat_statements.calls`) |
| `buffers`    | 8 kB pages those statements touched, cached or read from disk |
| `rows`       | Rows those statements returned or affected                    |
| `bytes`      | Decoded response body size                                    |

Only statements run by the `public_api` and `internal_api` roles count, so the script's own queries
never do. These are counts, not timings, so they do not move with runner load. To keep them the same
from run to run, the CI database (`compose.perf.yaml`) preloads `pg_stat_statements`, turns off
parallel query and autovacuum, and the script runs `VACUUM ANALYZE` before measuring. The driver's
array-type discovery query is excluded from these warmed counts: a pooled connection can open during
measurement even after the warm-up requests. All application queries still count.

Each route's numbers are compared with [`baseline.json`](baseline.json). A route fails when a metric
exceeds its allowance:

| Metric       | Allowance                     |
| ------------ | ----------------------------- |
| `statements` | the baseline, exactly         |
| `buffers`    | 1.2 × the baseline, plus 20   |
| `rows`       | 1.2 × the baseline, plus 20   |
| `bytes`      | 1.1 × the baseline, plus 1 kB |

One extra statement per request fails outright, because that is how an N+1 query shows itself. The
other allowances absorb small legitimate changes while catching a missing index, an unbounded result
set or a page that has grown much heavier. The tolerances are `TOLERANCES` in
[`src/budget.ts`](src/budget.ts). A route missing from the baseline, or a baseline entry no longer
measured, also fails. A metric well under its baseline passes with a note that the baseline could be
tightened.

A route over budget on statements, buffers or rows also lists the queries behind its numbers, in the
log and in the job summary: each distinct query with the role that ran it, its calls, rows and
buffers, most calls first. A query the route does not normally run, or one called once more than
usual, shows where the extra work came from.

## Time limits

Each route is then requested 15 times in sequence. The median fails the route if it exceeds the
route's `limitMs`: 250 ms for an API route, 500 ms for a page, and 1 s for the comparison page and
the CSV downloads. When they were set, CI's medians were 1–30 ms for the APIs and 8–139 ms for the
pages. The limits are 5–10 times that on purpose, because hosted runners vary a lot from run to run:
they catch a route that has become clearly slow, not a small slowdown. The counts above are what
catch the small ones. Median and p95 for every route are in the job summary.

## Accepting a change

When a change is meant to cost more, the failing run's summary gives the command to adopt its
numbers:

```sh
pnpm perf:accept <run-id>
```

It downloads the run's `perf-baseline` artifact with the GitHub CLI and updates `baseline.json` from
it, taking only what the run failed on: routes over their allowance on any metric, routes new to the
run, and routes it no longer measures, which are removed. Every other route keeps its committed
numbers, so small drift on passing routes is never adopted and the baseline does not creep upwards.
The command lists the routes it updated, added and removed. Commit the result, and the diff shows
the reviewer exactly which routes cost more.

To take every route's numbers from the run instead, add `--all`:

```sh
pnpm perf:accept <run-id> --all
```

Use it to tighten the baseline after an improvement, which the summary lists under "Could be
tightened", or after a change to the seed data moves every route. It also takes any routes over
budget in that run.

The routes are chosen by comparing the run with your `baseline.json`, so it must be the one CI
checked against. Bring the branch up to date with `main` before the run you accept, and accept it
from the commit it measured: the command refuses when `HEAD` is a different commit or
`baseline.json` has uncommitted changes. Every run that measures all the routes uploads the
artifact, within budget or not. A run that stops on a route error writes none, as it has no complete
set of numbers to adopt. The artifact holds counts only: a route meant to be slower needs its
`limitMs` raised in [`src/routes.ts`](src/routes.ts).

### Explaining it in the pull request

A pull request that changes `baseline.json` must say why in its body, under a heading of its own:

```md
## Route budgets

The indicator list now joins topics, one more statement per request.
```

The `Baseline changes carry a reason` check in
[`.github/workflows/pr-body.yml`](../../.github/workflows/pr-body.yml) fails until the body has a
`## Route budgets` heading with at least one line of text under it, before the next heading. It runs
again whenever the body is edited.

## Running it locally

The numbers depend on the production build and the database settings above, so the baseline should
come from CI. To run the check locally anyway, build the images
(`docker buildx bake -f docker/docker-bake.hcl --load`), start the stack with the same three compose
files as the CI job, seed it, then run `pnpm check:perf` with the database connection in the
environment (`POSTGRES_PASSWORD`, and `DB_HOST`, `DB_PORT`, `POSTGRES_DB`, `POSTGRES_USER` if they
differ from the defaults). The compose database is the development one, so this replaces your local
data.
