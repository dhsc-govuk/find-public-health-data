import { describe, expect, it } from 'vitest';

import { commands, resolveCommand, UsageError, usage } from './commands.ts';

describe('resolveCommand', () => {
  it('resolves a command from its words', () => {
    expect(resolveCommand(['db', 'migrate'])).toBe(commands['db migrate']);
  });

  it('rejects an unknown command by name', () => {
    expect(() => resolveCommand(['db', 'drop'])).toThrow(UsageError);
    expect(() => resolveCommand(['db', 'drop'])).toThrow(/db drop/);
  });

  it('rejects a group with no command after it', () => {
    expect(() => resolveCommand(['db'])).toThrow(UsageError);
  });

  it('rejects no arguments at all, rather than defaulting to something', () => {
    expect(() => resolveCommand([])).toThrow(UsageError);
  });
});

describe('commands', () => {
  it('registers the data lifecycle commands, and not the retired seed name', () => {
    expect(Object.keys(commands)).toEqual([
      'db bootstrap',
      'db migrate',
      'db status',
      'db import-core-data',
      'db seed-dummy-data',
      'db import-published-snapshot',
      'db migrate-live-data',
      'db rebuild-read-models',
      'db reset',
    ]);
  });
});

describe('usage', () => {
  it('lists every registered command, so the registry cannot outgrow the help', () => {
    const text = usage();

    for (const name of Object.keys(commands)) {
      expect(text).toContain(name);
    }
  });
});
