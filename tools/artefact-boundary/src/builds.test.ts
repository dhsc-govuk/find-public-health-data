import { describe, expect, it } from 'vitest';

import { collectBuildActions, collectImageBuilds } from './builds.ts';

const FILE = '.github/workflows/publish.yml';

function workflow(body: string): string {
  return `name: Publish\non:\n  push:\n${body}`;
}

describe('collectImageBuilds', () => {
  it('finds a docker build step with nothing reaching it', () => {
    const yaml = workflow(`
jobs:
  publish:
    steps:
      - name: Build the image
        env:
          APP: public-web
        run: docker build --build-arg "APP=\${APP}" --tag "\${REGISTRY}/\${APP}" .
`);
    expect(collectImageBuilds(yaml, FILE)).toEqual([
      { file: FILE, job: 'publish', step: '"Build the image"', references: [] },
    ]);
  });

  it.each([
    { label: 'docker build', run: 'docker build .' },
    { label: 'docker buildx build', run: 'docker buildx build .' },
    { label: 'docker image build', run: 'docker image build .' },
    { label: 'docker compose build', run: 'docker compose build' },
    { label: 'docker bake', run: 'docker bake --load' },
    { label: 'docker buildx bake', run: 'docker buildx bake -f docker/docker-bake.hcl --load' },
    { label: 'a continued line', run: 'set -e\ndocker \\\n  build .' },
    { label: 'an env prefix', run: 'DOCKER_BUILDKIT=1 docker build .' },
    { label: 'sudo', run: 'sudo docker build .' },
    { label: 'sudo with a flag', run: 'sudo -E docker build .' },
    { label: 'sudo with a long flag', run: 'sudo --preserve-env docker build .' },
    { label: 'after &&', run: 'echo start && docker build .' },
    { label: 'in a substitution', run: 'cid=$(docker build -q .)' },
  ])('recognises $label as a build', ({ run }) => {
    const yaml = workflow(`
jobs:
  ci:
    steps:
      - run: |
          ${run.replaceAll('\n', '\n          ')}
`);
    expect(collectImageBuilds(yaml, FILE)).toHaveLength(1);
  });

  it('recognises docker/build-push-action as a build', () => {
    const yaml = workflow(`
jobs:
  ci:
    steps:
      - uses: docker/build-push-action@abc123
        with:
          push: false
`);
    expect(collectImageBuilds(yaml, FILE)).toEqual([
      { file: FILE, job: 'ci', step: '#1', references: [] },
    ]);
  });

  it('recognises docker/bake-action as a build, and a secret in its env', () => {
    const yaml = workflow(`
jobs:
  ci:
    steps:
      - uses: docker/bake-action@abc123
        env:
          OCI_REVISION: \${{ secrets.TOKEN }}
        with:
          load: true
`);
    expect(collectImageBuilds(yaml, FILE)).toEqual([
      { file: FILE, job: 'ci', step: '#1', references: ['secrets.TOKEN (step env)'] },
    ]);
  });

  it.each([
    'docker run --rm image',
    'docker login ghcr.io',
    'pnpm build',
    'echo "docker build is later"',
  ])('does not treat %j as a build', (run) => {
    const yaml = workflow(`
jobs:
  ci:
    steps:
      - run: ${JSON.stringify(run)}
`);
    expect(collectImageBuilds(yaml, FILE)).toEqual([]);
  });

  it('reports a secret passed as a build arg', () => {
    const yaml = workflow(`
jobs:
  publish:
    steps:
      - name: Build the image
        run: docker build --build-arg "NPM_TOKEN=\${{ secrets.NPM_TOKEN }}" .
`);
    expect(collectImageBuilds(yaml, FILE)[0]?.references).toEqual(['secrets.NPM_TOKEN (step run)']);
  });

  it('reports a secret in the step env, with and run, deduplicated per route', () => {
    const yaml = workflow(`
jobs:
  publish:
    steps:
      - uses: docker/build-push-action@abc123
        env:
          TOKEN: \${{ secrets.TOKEN }}
        with:
          build-args: |
            TOKEN=\${{ secrets.TOKEN }}
            OTHER=\${{ secrets.OTHER }}
`);
    expect(collectImageBuilds(yaml, FILE)[0]?.references).toEqual([
      'secrets.TOKEN (step env)',
      'secrets.OTHER (step with)',
      'secrets.TOKEN (step with)',
    ]);
  });

  it('reports a secret inherited from the job env', () => {
    const yaml = workflow(`
jobs:
  publish:
    env:
      REGISTRY: ghcr.io/example
      NPM_TOKEN: \${{ secrets.NPM_TOKEN }}
    steps:
      - run: docker build .
`);
    expect(collectImageBuilds(yaml, FILE)[0]?.references).toEqual(['secrets.NPM_TOKEN (job env)']);
  });

  it('reports a secret inherited from the workflow env', () => {
    const yaml = workflow(`
env:
  NPM_TOKEN: \${{ secrets.NPM_TOKEN }}
jobs:
  publish:
    steps:
      - run: docker build .
`);
    expect(collectImageBuilds(yaml, FILE)[0]?.references).toEqual([
      'secrets.NPM_TOKEN (workflow env)',
    ]);
  });

  it('reports the whole secrets context and bracket access', () => {
    const yaml = workflow(`
jobs:
  publish:
    steps:
      - env:
          ALL: \${{ toJSON(secrets) }}
          ONE: \${{ secrets['MY-TOKEN'] }}
        run: docker build .
`);
    expect(collectImageBuilds(yaml, FILE)[0]?.references).toEqual([
      'secrets (step env)',
      "secrets['MY-TOKEN'] (step env)",
    ]);
  });

  it('ignores the word inside expression string literals', () => {
    const yaml = workflow(`
jobs:
  publish:
    steps:
      - env:
          A: \${{ contains('secrets', github.ref) }}
          B: \${{ 'it''s about secrets' }}
          C: \${{ vars['secrets'] }}
        run: docker build .
`);
    expect(collectImageBuilds(yaml, FILE)[0]?.references).toEqual([]);
  });

  it('still reports a reference beside a literal naming it', () => {
    const yaml = workflow(`
jobs:
  publish:
    steps:
      - env:
          A: \${{ contains('secrets', secrets.X) }}
        run: docker build .
`);
    expect(collectImageBuilds(yaml, FILE)[0]?.references).toEqual(['secrets.X (step env)']);
  });

  it('ignores identifiers that merely contain the word', () => {
    const yaml = workflow(`
jobs:
  publish:
    steps:
      - env:
          A: \${{ vars.secrets2 }}
          B: \${{ vars.secretsmanager_arn }}
          C: \${{ steps.setup.outputs.secrets }}
        run: docker build .
`);
    expect(collectImageBuilds(yaml, FILE)[0]?.references).toEqual([]);
  });

  it('ignores the word outside an expression', () => {
    const yaml = workflow(`
jobs:
  publish:
    steps:
      - name: Build the image
        # The build takes no secrets.
        run: |
          echo "no secrets reach this build"
          docker build --build-arg APP=\${APP} .
`);
    expect(collectImageBuilds(yaml, FILE)[0]?.references).toEqual([]);
  });

  it('does not attribute a secret used by a different step to the build', () => {
    const yaml = workflow(`
jobs:
  publish:
    steps:
      - run: docker build .
      - run: docker push image
        env:
          TOKEN: \${{ secrets.TOKEN }}
`);
    expect(collectImageBuilds(yaml, FILE)).toEqual([
      { file: FILE, job: 'publish', step: '#1', references: [] },
    ]);
  });

  it('treats a step using a local action that builds as a build', () => {
    const yaml = workflow(`
jobs:
  publish:
    steps:
      - name: Build the image
        uses: ./.github/actions/build-image
        with:
          build-args: TOKEN=\${{ secrets.TOKEN }}
`);
    expect(collectImageBuilds(yaml, FILE, new Set(['.github/actions/build-image']))).toEqual([
      {
        file: FILE,
        job: 'publish',
        step: '"Build the image"',
        references: ['secrets.TOKEN (step with)'],
      },
    ]);
  });

  it('ignores a step using a local action that does not build', () => {
    const yaml = workflow(`
jobs:
  publish:
    steps:
      - uses: ./.github/actions/scan-image
        with:
          token: \${{ secrets.TOKEN }}
`);
    expect(collectImageBuilds(yaml, FILE, new Set(['.github/actions/build-image']))).toEqual([]);
  });

  it('returns nothing for a workflow with no jobs', () => {
    expect(collectImageBuilds(workflow(''), FILE)).toEqual([]);
  });

  it('refuses a file that is not a workflow', () => {
    expect(() => collectImageBuilds('just a string', FILE)).toThrow(/not a workflow/);
  });
});

describe('collectBuildActions', () => {
  const action = (body: string) =>
    `name: Build\ndescription: Builds.\nruns:\n  using: composite\n${body}`;

  it('finds an action that builds directly', () => {
    const actions = new Map([
      [
        '.github/actions/build-image',
        action(`
  steps:
    - uses: docker/build-push-action@abc123
`),
      ],
      [
        '.github/actions/scan-image',
        action(`
  steps:
    - uses: aquasecurity/trivy-action@abc123
`),
      ],
    ]);
    expect(collectBuildActions(actions)).toEqual(new Set(['.github/actions/build-image']));
  });

  it('finds an action that builds only by calling another', () => {
    const actions = new Map([
      [
        '.github/actions/build-image',
        action(`
  steps:
    - run: docker build .
`),
      ],
      [
        '.github/actions/build-and-scan',
        action(`
  steps:
    - uses: ./.github/actions/build-image
    - uses: ./.github/actions/scan-image
`),
      ],
    ]);
    expect(collectBuildActions(actions)).toEqual(
      new Set(['.github/actions/build-image', '.github/actions/build-and-scan']),
    );
  });

  it('ignores an action with no steps at all', () => {
    const actions = new Map([
      [
        '.github/actions/setup-workspace',
        'name: Setup\ndescription: Installs.\nruns:\n  using: node24\n  main: index.js\n',
      ],
    ]);
    expect(collectBuildActions(actions)).toEqual(new Set());
  });
});
