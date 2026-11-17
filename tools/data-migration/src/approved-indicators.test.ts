import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

import { APPROVED_INDICATORS_FILE, parseApprovedIndicators } from './indicator-checks.ts';

it('commits the launch list with its provenance and without the test indicator', async () => {
  const raw = await readFile(APPROVED_INDICATORS_FILE, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  for (const field of ['source', 'sheet', 'rule', 'extractedOn'])
    expect(parsed[field]).toBeTruthy();
  const ids = parseApprovedIndicators(raw);
  expect(ids.length).toBe(785);
  expect(ids).not.toContain(94204);
});

it('follows the FPH-716 changes to the sheet', async () => {
  const ids = parseApprovedIndicators(await readFile(APPROVED_INDICATORS_FILE, 'utf8'));
  // Prioritised in column AF, and published in Fingertips after the sheet was started.
  const added = [
    90452, 90453, 94157, 94168, 94169, 94170, 94171, 94343, 94344, 94348, 94349, 94350, 94351,
    94352, 94353, 94356, 94357, 94359, 94360,
  ];
  expect(ids).toEqual(expect.arrayContaining(added));
  expect(ids).not.toContain(92339);
});

it('accepts a bare array as an override file', () => {
  expect(parseApprovedIndicators('[108, 241]')).toEqual([108, 241]);
  expect(() => parseApprovedIndicators('{"indicators":[1,1]}')).toThrow(/duplicate/);
});
