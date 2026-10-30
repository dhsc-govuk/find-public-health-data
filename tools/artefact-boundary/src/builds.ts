import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse } from 'yaml';

/** One image-build step and every secret reference that can reach it — none, when it is clean. */
export type ImageBuild = {
  file: string;
  job: string;
  step: string;
  references: string[];
};

type Step = {
  name?: unknown;
  uses?: unknown;
  run?: unknown;
  env?: unknown;
  with?: unknown;
};

type Job = { env?: unknown; steps?: unknown };

const WORKFLOW_EXTENSIONS = ['.yml', '.yaml'];
const ACTION_FILENAMES = ['action.yml', 'action.yaml'];

const IMAGE_BUILD_ACTION = /^docker\/(?:build-push|bake)-action(?:@|$)/;
// Where one command ends and the next may begin: a newline, `;`, `&`, `|` or `(`.
const COMMAND_BOUNDARY = /[\n;&|(]/;
const LINE_CONTINUATION = /\\\n/g;
const COMMAND_PREFIX = /^(?:\w+=|sudo$|-)/;
const BUILD_SUBCOMMANDS = ['buildx', 'image', 'compose'];

// Only inside `${{ }}`: the word in a shell string or an echo is not a secret. YAML comments
// never get here — the parser drops them. A `}}` inside a string literal truncates the match —
// accepted; the Trivy scan on the built image is the backstop.
const EXPRESSION = /\$\{\{[\s\S]*?\}\}/g;
// GitHub expressions quote strings with `'` alone, doubling it to escape a literal quote.
const STRING_LITERAL = /'[^']*(?:''[^']*)*'/g;
// The `secrets` context itself, whole: not `vars.secrets2`, not a `.secrets` property of
// another context, and not the word inside a bracket-access string like `vars['secrets']`.
const SECRET_REFERENCE = /(?<![\w.'])secrets(?!\w)(?:\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\])?/g;

/**
 * The images are public, so anything `docker build` can see may end up in a layer anyone can
 * pull. Inspects each build step's `run`, `with` and `env`, and the `env` it inherits from the
 * job and the workflow. A step that `uses:` one of the repository's own actions counts as a build
 * step when that action builds; otherwise moving a build behind one would hide it from this check.
 */
export async function findSecretsReachingBuilds(repoRoot: string): Promise<ImageBuild[]> {
  const buildActions = collectBuildActions(await readLocalActions(repoRoot));
  const dir = path.join(repoRoot, '.github', 'workflows');
  const files = (await readdir(dir))
    .filter((name) => WORKFLOW_EXTENSIONS.includes(path.extname(name)))
    .sort();

  const builds = (
    await Promise.all(
      files.map(async (name) => {
        const file = path.join(dir, name);
        return collectImageBuilds(
          await readFile(file, 'utf8'),
          path.relative(repoRoot, file),
          buildActions,
        );
      }),
    )
  ).flat();

  if (builds.length === 0) {
    throw new Error(`No workflow under ${dir} builds an image; nothing can be checked.`);
  }

  return builds.filter(({ references }) => references.length > 0);
}

/** Each local composite action's definition, keyed by the path a workflow would `uses:`. */
async function readLocalActions(repoRoot: string): Promise<Map<string, string>> {
  const dir = path.join(repoRoot, '.github', 'actions');
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

  const actions = new Map<string, string>();
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    for (const filename of ACTION_FILENAMES) {
      const yaml = await readFile(path.join(dir, entry.name, filename), 'utf8').catch(() => null);
      if (yaml !== null) {
        actions.set(path.posix.join('.github', 'actions', entry.name), yaml);
        break;
      }
    }
  }
  return actions;
}

/**
 * The local actions that build an image, directly or by calling another that does. A composite
 * action cannot read the `secrets` context, so a secret can only reach it through the calling
 * step's `with` or `env`. The workflow scan already checks those, which is why the calling step
 * has to count as a build.
 */
export function collectBuildActions(actions: ReadonlyMap<string, string>): Set<string> {
  const steps = new Map<string, Step[]>();
  for (const [action, yaml] of actions) {
    const parsed: unknown = parse(yaml);
    const runs = (parsed as { runs?: unknown } | null)?.runs;
    const declared = (runs as { steps?: unknown } | undefined)?.steps;
    steps.set(action, Array.isArray(declared) ? (declared as Step[]) : []);
  }

  // Iterate to a fixed point: an action that builds only by calling another is found once that
  // other is in the set.
  const building = new Set<string>();
  let found: boolean;
  do {
    found = false;
    for (const [action, actionSteps] of steps) {
      if (!building.has(action) && actionSteps.some((step) => buildsAnImage(step, building))) {
        building.add(action);
        found = true;
      }
    }
  } while (found);

  return building;
}

/** Every image-build step in one workflow, each with the secret references that can reach it. */
export function collectImageBuilds(
  yaml: string,
  file: string,
  buildActions: ReadonlySet<string> = new Set(),
): ImageBuild[] {
  const parsed: unknown = parse(yaml);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${file} is not a workflow; nothing can be checked.`);
  }

  const { env: workflowEnv, jobs } = parsed as { env?: unknown; jobs?: unknown };
  if (typeof jobs !== 'object' || jobs === null) {
    return [];
  }

  const workflowReferences = secretReferences(scalarsOf(workflowEnv), 'workflow env');

  return Object.entries(jobs as Record<string, Job>).flatMap(([job, definition]) => {
    if (typeof definition !== 'object' || definition === null || !Array.isArray(definition.steps)) {
      return [];
    }
    const jobReferences = secretReferences(scalarsOf(definition.env), 'job env');

    return (definition.steps as Step[]).flatMap((step, index) => {
      if (typeof step !== 'object' || step === null || !buildsAnImage(step, buildActions)) {
        return [];
      }
      const references = [
        ...workflowReferences,
        ...jobReferences,
        ...secretReferences(scalarsOf(step.env), 'step env'),
        ...secretReferences(scalarsOf(step.with), 'step with'),
        ...secretReferences(typeof step.run === 'string' ? [step.run] : [], 'step run'),
      ];
      return [{ file, job, step: stepLabel(step, index), references }];
    });
  });
}

function buildsAnImage(step: Step, buildActions: ReadonlySet<string>): boolean {
  if (typeof step.uses === 'string') {
    if (IMAGE_BUILD_ACTION.test(step.uses)) {
      return true;
    }
    if (step.uses.startsWith('./') && buildActions.has(step.uses.slice(2).replace(/\/+$/, ''))) {
      return true;
    }
  }
  return typeof step.run === 'string' && runsAnImageBuild(step.run);
}

/**
 * `docker build`, `docker {buildx,image,compose} build`, or `docker bake` or `docker buildx bake`,
 * in command position — after any `VAR=value`, `sudo` or `-flag` prefix. Tokenised rather than matched by one regular expression,
 * which CodeQL rightly flagged for backtracking; `docker build` in an echo or a string never
 * qualifies. A flag's separate value is indistinguishable from a command, so `sudo -u root
 * docker build` is missed — the Trivy scan on the built image is the backstop.
 */
function runsAnImageBuild(script: string): boolean {
  return script
    .replaceAll(LINE_CONTINUATION, ' ')
    .split(COMMAND_BOUNDARY)
    .some((command) => {
      const words = command.trim().split(/\s+/);
      const start = words.findIndex((word) => !COMMAND_PREFIX.test(word));
      const [first, second = '', third] = start === -1 ? [] : words.slice(start);
      if (first !== 'docker') {
        return false;
      }
      return (
        second === 'build' ||
        second === 'bake' ||
        (BUILD_SUBCOMMANDS.includes(second) && third === 'build') ||
        (second === 'buildx' && third === 'bake')
      );
    });
}

function stepLabel(step: Step, index: number): string {
  return typeof step.name === 'string' ? `"${step.name}"` : `#${index + 1}`;
}

function scalarsOf(mapping: unknown): string[] {
  if (typeof mapping !== 'object' || mapping === null) {
    return [];
  }
  return Object.values(mapping).map((value) => String(value));
}

/** Each distinct secret reference inside an expression, tagged with its route. */
function secretReferences(values: readonly string[], via: string): string[] {
  const found = new Set<string>();
  for (const value of values) {
    for (const [expression] of value.matchAll(EXPRESSION)) {
      for (const [reference] of withoutStringLiterals(expression).matchAll(SECRET_REFERENCE)) {
        found.add(`${reference} (${via})`);
      }
    }
  }
  return [...found].sort();
}

/**
 * Blanks out an expression's string literals, so the word inside one is not a reference —
 * except in bracket access, where the literal names the secret and is the point.
 */
function withoutStringLiterals(expression: string): string {
  return expression.replaceAll(STRING_LITERAL, (literal: string, offset: number) =>
    expression[offset - 1] === '[' ? literal : "''",
  );
}
