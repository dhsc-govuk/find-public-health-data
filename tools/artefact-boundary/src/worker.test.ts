import { describe, expect, it } from 'vitest';

import { findPackagesKeptFromWorker } from './worker.ts';
import { collectDependencyClosure, type WorkspacePackage } from './workspace.ts';

function workspace(...packages: Array<[string, string[]]>): Map<string, WorkspacePackage> {
  return new Map(
    packages.map(([name, dependencies]) => [
      name,
      { name, dir: `/repo/${name}`, dependencies, devDependencies: [] },
    ]),
  );
}

const KEPT: Array<[string, string[]]> = [
  ['@fphd/internal-api-features', ['@fphd/api-server', '@fphd/auth', '@fphd/internal-workflow']],
  ['@fphd/api-server', ['@fphd/auth']],
  ['@fphd/auth', []],
  ['@fphd/internal-workflow', ['@fphd/db']],
  ['@fphd/db', []],
];

function closureOf(packages: Map<string, WorkspacePackage>) {
  return collectDependencyClosure('@fphd/internal-worker', packages, { bundled: false });
}

describe('findPackagesKeptFromWorker', () => {
  it('flags the internal API features and all they bring', () => {
    const packages = workspace(['@fphd/internal-worker', ['@fphd/internal-api-features']], ...KEPT);

    expect(findPackagesKeptFromWorker(closureOf(packages), packages)).toEqual([
      '@fphd/api-server',
      '@fphd/auth',
      '@fphd/internal-api-features',
    ]);
  });

  it('flags @fphd/auth reached through the API server', () => {
    const packages = workspace(['@fphd/internal-worker', ['@fphd/api-server']], ...KEPT);

    expect(findPackagesKeptFromWorker(closureOf(packages), packages)).toEqual([
      '@fphd/api-server',
      '@fphd/auth',
    ]);
  });

  it('passes a closure holding only the workflow', () => {
    const packages = workspace(['@fphd/internal-worker', ['@fphd/internal-workflow']], ...KEPT);

    expect(findPackagesKeptFromWorker(closureOf(packages), packages)).toEqual([]);
  });

  it('throws when the workspace has no package of a name it looks for', () => {
    const packages = workspace(['@fphd/internal-worker', ['@fphd/db']], ['@fphd/db', []]);

    expect(() => findPackagesKeptFromWorker(['@fphd/db'], packages)).toThrow(
      'is not a workspace package',
    );
  });
});
