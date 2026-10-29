import { DrizzleQueryError } from 'drizzle-orm';
import { stdSerializers } from 'pino';
import { describe, expect, it } from 'vitest';

import { serializeError } from './index.ts';
import { createCapturingLogger } from './testing.ts';

const MARKER = 'marker-3f9c2e';

function postgresError(): Error {
  return Object.assign(new Error('division by zero'), {
    code: '22012',
    severity: 'ERROR',
    routine: 'int4div',
  });
}

function failedQuery(): DrizzleQueryError {
  return new DrizzleQueryError(
    'select $1::text, 1/0',
    [MARKER, `line one\n${MARKER}`],
    postgresError(),
  );
}

describe('createLogger', () => {
  it("logs a failed query's statement and Postgres code, not its parameters", () => {
    const { logger, lines } = createCapturingLogger('test');

    logger.error({ err: failedQuery() }, 'Command failed');

    expect(lines).toHaveLength(1);
    expect(JSON.stringify(lines)).not.toContain(MARKER);
    expect(lines[0]).toMatchObject({
      err: {
        type: 'DrizzleQueryError',
        message: 'Failed query: division by zero',
        query: 'select $1::text, 1/0',
        cause: {
          message: 'division by zero',
          code: '22012',
          severity: 'ERROR',
          routine: 'int4div',
        },
      },
    });
  });

  it('takes the message from a failed query without its parameters when a call gives none', () => {
    const { logger, lines } = createCapturingLogger('test');

    logger.error({ err: failedQuery() });
    logger.error(failedQuery());

    expect(JSON.stringify(lines)).not.toContain(MARKER);
    expect(lines).toMatchObject([{ msg: 'Failed query' }, { msg: 'Failed query' }]);
  });

  it('keeps the message a call gives', () => {
    const { logger, lines } = createCapturingLogger('test');

    logger.error({ err: failedQuery() }, 'Command failed');

    expect(lines).toMatchObject([{ msg: 'Command failed' }]);
  });
});

describe('serializeError', () => {
  it('keeps the stack frames of a failed query', () => {
    const serialized = serializeError(failedQuery()) as { stack: string };

    expect(serialized.stack).toMatch(/^Error: Failed query\n {4}at /);
    expect(serialized.stack).toContain('caused by: Error: division by zero');
  });

  it('drops the parameters of a failed query that caused another error', () => {
    const error = new Error('Import failed', { cause: failedQuery() });

    const serialized = serializeError(error) as { type: string; message: string };

    expect(JSON.stringify(serialized)).not.toContain(MARKER);
    expect(serialized).toMatchObject({
      type: 'Error',
      message: 'Import failed: Failed query: division by zero',
    });
  });

  it("drops the parameters from pino's serialization, which pino-http passes", () => {
    const serialized = serializeError(stdSerializers.err(failedQuery()));

    expect(JSON.stringify(serialized)).not.toContain(MARKER);
    expect(serialized).toMatchObject({ cause: { code: '22012' } });
  });

  it('drops the parameters of a failed query in an AggregateError or a field', () => {
    const errors = [
      new AggregateError([failedQuery()], 'Several failed'),
      Object.assign(new Error('Wrapped'), { original: failedQuery() }),
    ];

    for (const error of errors) {
      expect(JSON.stringify(serializeError(error))).not.toContain(MARKER);
    }
  });

  it('drops the parameters of failed queries whose messages share a prefix', () => {
    const statement = 'select $1::text';
    const error = new AggregateError([
      new DrizzleQueryError(statement, [`x,${MARKER}`], postgresError()),
      new DrizzleQueryError(statement, ['x'], postgresError()),
    ]);

    expect(JSON.stringify(serializeError(error))).not.toContain(MARKER);
  });

  it('drops the parameters of a failed query in a circular cause chain', () => {
    const query = failedQuery();
    const wrapper = new Error('Wrapped', { cause: query });
    query.cause = wrapper;

    expect(JSON.stringify(serializeError(query))).not.toContain(MARKER);
    expect(JSON.stringify(serializeError(wrapper))).not.toContain(MARKER);
  });

  it('serializes an error whose message is a getter', () => {
    class GetterError extends Error {
      override get message() {
        return 'From a getter';
      }
    }
    const error = new GetterError(undefined, { cause: failedQuery() });

    expect(serializeError(error)).toMatchObject({
      type: 'GetterError',
      message: 'From a getter: Failed query: division by zero',
    });
  });

  it("serializes any other error as pino's serializer does", () => {
    const error = Object.assign(new TypeError('Bad input', { cause: postgresError() }), {
      code: 'E_INPUT',
    });

    expect(serializeError(error)).toEqual(stdSerializers.err(error));
  });
});
