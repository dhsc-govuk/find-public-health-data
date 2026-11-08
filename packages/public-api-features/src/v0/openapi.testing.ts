import { readFileSync } from 'node:fs';

import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

const spec: unknown = parse(readFileSync(new URL('../../openapi.yaml', import.meta.url), 'utf8'));

// OpenAPI 3.1 schemas are JSON Schema 2020-12, apart from keywords such as `example`, which
// strict mode would reject.
const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false });
addFormats.default(ajv);
ajv.addSchema(spec as object, 'spec');

function at(path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (node, key) => (typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined),
    spec,
  );
}

function pointer(path: readonly string[]): string {
  return path.map((key) => key.replaceAll('~', '~0').replaceAll('/', '~1')).join('/');
}

/**
 * Throws unless `body` matches the schema the spec gives for a GET of `path` answering `status`
 * as `mediaType`. `path` is the spec's path template, such as `/v0/tags`.
 */
export function expectToMatchSpec(
  path: string,
  status: number,
  body: unknown,
  mediaType = 'application/json',
): void {
  const response = ['paths', path, 'get', 'responses', String(status)];
  const declared = at(response);
  // A response declared once under components is referenced from each path.
  const ref =
    typeof declared === 'object' && declared !== null && '$ref' in declared
      ? String(declared.$ref).replace(/^#\//, '').split('/')
      : response;
  const schemaPath = [...ref, 'content', mediaType, 'schema'];

  if (at(schemaPath) === undefined) {
    throw new Error(`The spec has no ${mediaType} schema for GET ${path} ${status}`);
  }

  const validate = ajv.compile({ $ref: `spec#/${pointer(schemaPath)}` });

  if (!validate(body)) {
    throw new Error(
      `GET ${path} ${status} doesn't match the spec: ${ajv.errorsText(validate.errors)}`,
    );
  }
}

/** The columns a CSV response has, from the spec schema of the row it describes. */
export function specColumns(schemaName: string): string[] {
  const columns = (name: string, prefix: string): string[] => {
    const schema = at(['components', 'schemas', name]) as {
      properties?: Record<string, { $ref?: string; properties?: Record<string, unknown> }>;
    };
    return Object.entries(schema.properties ?? {}).flatMap(([key, property]) => {
      if (property.$ref !== undefined) {
        const target = property.$ref.split('/').at(-1) ?? '';
        const nested = at(['components', 'schemas', target]) as { type?: unknown };
        return nested.type === 'object' ? columns(target, `${prefix}${key}.`) : [`${prefix}${key}`];
      }
      if (property.properties !== undefined) {
        return Object.keys(property.properties).map((inner) => `${prefix}${key}.${inner}`);
      }
      return [`${prefix}${key}`];
    });
  };
  return columns(schemaName, '');
}
