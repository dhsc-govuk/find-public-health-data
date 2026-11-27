/** Measured test time in seconds for each spec file, keyed by its path under e2e/tests. */
export type Timings = Readonly<Record<string, number>>;

/** The spec files one shard runs, and the measured test time they add up to. */
export type Shard = { files: string[]; seconds: number };

/**
 * Splits spec files into `total` shards of about equal measured test time.
 *
 * The heaviest file goes first, each to the shard with the least time so far. Equal weights are
 * taken in path order and equal shards in shard order, so every shard, working this out on its
 * own, arrives at the same split. A file with no timing yet weighs the median of the files that
 * have one, and with no timings at all every file weighs the same, which spreads files by count.
 */
export function packFiles(files: readonly string[], timings: Timings, total: number): Shard[] {
  if (!Number.isInteger(total) || total < 1) {
    throw new Error(`The shard total must be a positive whole number, not ${total}.`);
  }
  const unique = [...new Set(files)];
  const measured = (file: string) => (Object.hasOwn(timings, file) ? timings[file] : undefined);
  const fallback = median(unique.flatMap((file) => measured(file) ?? [])) ?? 1;
  const weighted = unique
    .map((file) => ({ file, seconds: measured(file) ?? fallback }))
    .sort((a, b) => b.seconds - a.seconds || byPath(a.file, b.file));

  const shards: Shard[] = Array.from({ length: total }, () => ({ files: [], seconds: 0 }));
  for (const { file, seconds } of weighted) {
    const lightest = shards.reduce((best, shard) => (shard.seconds < best.seconds ? shard : best));
    lightest.files.push(file);
    lightest.seconds += seconds;
  }
  return shards.map((shard) => ({ files: [...shard.files].sort(byPath), seconds: shard.seconds }));
}

/** Code-unit order, which unlike localeCompare is the same on every machine. */
function byPath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function median(values: readonly number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b);
  const upper = sorted[Math.floor(sorted.length / 2)];
  const lower = sorted[Math.ceil(sorted.length / 2) - 1];
  return upper === undefined || lower === undefined ? undefined : (lower + upper) / 2;
}
