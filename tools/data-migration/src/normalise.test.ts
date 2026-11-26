import { DATA_MIGRATION_NULL } from '@fphd/db-operations/data-migration-contract';
import { describe, expect, it } from 'vitest';

import { encodeRow } from './csv.ts';
import { normaliseRow, stripAreaName } from './normalise.ts';
import { plainTextFromHtml } from './plain-text.ts';
import { deterministicUuid } from './prepare-baseline.ts';

describe('migration transforms', () => {
  it('keeps database null distinct from an empty string', () => {
    expect(encodeRow(['__FPHD_NULL_5f92c66de4b849b4a717c23f5cbdb8a1__', '', 'a,"b"'], true)).toBe(
      ',"","a,""b"""\r\n',
    );
  });

  it('decodes curly quote entities to the matching curly quotes', () => {
    expect(plainTextFromHtml('the vision &ldquo;To improve&rdquo; and &lsquo;it&rsquo;s')).toBe(
      'the vision “To improve” and ‘it’s',
    );
  });

  it('gives the ids the Python transform gave, so earlier archives and packages still join', () => {
    expect(deterministicUuid('indicator', '108')).toBe('019de0d5-c800-700f-8000-0000000000d8');
    expect(deterministicUuid('indicator', '93861')).toBe('019de0d5-c800-700f-8000-00000002dd4a');
    expect(deterministicUuid('indicator_version', '108')).toBe(
      '019de0d5-c800-7010-8000-0000000000d8',
    );
  });

  it('maps a source id to the same UUID every time', () => {
    expect(deterministicUuid('indicator', '108')).toBe(deterministicUuid('indicator', '108'));
    expect(deterministicUuid('indicator', '108')).not.toBe(deterministicUuid('indicator', '109'));
  });

  it('rejects source ids outside the positive integer key space', () => {
    expect(() => deterministicUuid('indicator', '-1')).toThrow('not a positive integer');
    expect(() => deterministicUuid('indicator', '0')).toThrow('not a positive integer');
  });

  it('converts metadata HTML to display text', () => {
    expect(plainTextFromHtml('<p>One &amp; two</p><p>Three<br>four</p>')).toBe(
      'One & two\nThree\nfour',
    );
  });

  it('strips HTML from the original frequency text during preparation', () => {
    expect(
      normaliseRow(
        'indicator_version',
        ['name', 'update_frequency_text'],
        ['Example', '<p>Academic year</p><p>Published in winter.</p>'],
      ),
    ).toEqual(['Example', 'Academic year\nPublished in winter.', 'example']);
  });

  it('preserves metadata null and empty values', () => {
    expect(
      normaliseRow(
        'indicator_metadata',
        ['definition', 'caveats'],
        ['__FPHD_NULL_5f92c66de4b849b4a717c23f5cbdb8a1__', ''],
      ),
    ).toEqual(['__FPHD_NULL_5f92c66de4b849b4a717c23f5cbdb8a1__', '']);
  });

  it('gives a mapped area type its display group and leaves an unmapped one null', () => {
    expect(normaliseRow('area_type', ['id', 'name'], ['7', 'GPs'])).toEqual([
      '7',
      'GPs',
      'GP practices',
      '6',
    ]);
    expect(normaliseRow('area_type', ['id', 'name'], ['8', 'Clinical networks'])).toEqual([
      '8',
      'Clinical networks',
      DATA_MIGRATION_NULL,
      DATA_MIGRATION_NULL,
    ]);
  });

  it('writes the notes and caveats answers of raw Pholio prose, null where unanswered', () => {
    const header = ['id', 'name', 'disclosure_control', 'caveats', 'notes', 'data_source_id'];
    const row = ['7', 'Obesity', 'Not applied', '<p>Rates &ge; 5</p>', '\n&nbsp;', '12'];
    expect(normaliseRow('indicator_version', header, row)).toEqual([
      '7',
      'Obesity',
      'no',
      DATA_MIGRATION_NULL,
      'true',
      'Rates ≥ 5',
      DATA_MIGRATION_NULL,
      DATA_MIGRATION_NULL,
      '12',
      'obesity',
    ]);
  });

  it('cleans source geography suffixes', () => {
    expect(stripAreaName('London region (statistical)')).toBe('London');
    expect(stripAreaName('Cornwall UA')).toBe('Cornwall');
  });
});
