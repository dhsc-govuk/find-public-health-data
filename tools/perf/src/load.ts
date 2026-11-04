import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { percentile } from './budget.ts';

const { values } = parseArgs({
  options: {
    'base-url': { type: 'string' },
    path: { type: 'string', multiple: true },
    concurrency: { type: 'string', default: '1,4,8' },
    rounds: { type: 'string', default: '3' },
    output: { type: 'string' },
    mixed: { type: 'boolean', default: false },
    'skip-warmup': { type: 'boolean', default: false },
  },
});

const base = new URL(values['base-url'] ?? '');
const paths = values.path ?? [];
const levels = values.concurrency.split(',').map(Number);
const rounds = Number(values.rounds);
if (
  !['http:', 'https:'].includes(base.protocol) ||
  !paths.length ||
  paths.some((path) => !path.startsWith('/') || path.startsWith('//')) ||
  [...levels, rounds].some((n) => !Number.isSafeInteger(n) || n < 1)
) {
  throw new Error('Supply --base-url, --path and positive integer concurrency levels and rounds');
}

type Sample = {
  path: string;
  status: number;
  headersMs: number;
  fullMs: number;
  bytes: number;
  error?: string;
};

async function load(path: string): Promise<Sample> {
  const start = performance.now();
  let status = 0;
  let headersMs = 0;
  try {
    const response = await fetch(new URL(path, base), {
      headers: {
        'user-agent': 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36',
        'accept-encoding': 'gzip',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    status = response.status;
    headersMs = Math.round(performance.now() - start);
    const html = await response.text();
    const error =
      status !== 200
        ? `HTTP ${status}`
        : /could not be loaded|render was aborted|Unexpected Server Error|Server Timeout|\$RX\("/.test(
              html,
            )
          ? 'A streamed section failed'
          : undefined;
    return {
      path,
      status,
      headersMs,
      fullMs: Math.round(performance.now() - start),
      bytes: Buffer.byteLength(html),
      ...(error ? { error } : {}),
    };
  } catch (error) {
    return {
      path,
      status,
      headersMs,
      fullMs: Math.round(performance.now() - start),
      bytes: 0,
      error: String(error),
    };
  }
}

const results = [];
if (!values['skip-warmup'])
  for (const path of paths) {
    const warmup = await load(path);
    if (warmup.error) throw new Error(`${path}: ${warmup.error}`);
  }
for (const concurrency of levels) {
  for (const routes of values.mixed ? [paths] : paths.map((path) => [path])) {
    const samples: Sample[] = [];
    const total = Math.max(6, concurrency * rounds);
    let next = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (next < total) {
          const index = next++;
          samples.push(await load(routes[index % routes.length] as string));
        }
      }),
    );
    const summary = {
      paths: routes,
      concurrency,
      requests: total,
      failures: samples.filter((sample) => sample.error).length,
      p50FullMs: percentile(
        samples.map((sample) => sample.fullMs),
        50,
      ),
      p95FullMs: percentile(
        samples.map((sample) => sample.fullMs),
        95,
      ),
      p95HeadersMs: percentile(
        samples.map((sample) => sample.headersMs),
        95,
      ),
      maxFullMs: Math.max(...samples.map((sample) => sample.fullMs)),
    };
    results.push({ ...summary, samples });
    console.log(JSON.stringify(summary));
    if (values.output) {
      await writeFile(
        values.output,
        `${JSON.stringify({ measuredAt: new Date().toISOString(), base, results }, null, 2)}\n`,
      );
    }
    if (summary.failures) process.exitCode = 1;
  }
}
