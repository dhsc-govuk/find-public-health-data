import { randomBytes } from 'node:crypto';

import { schema } from '@fphd/db';
import { createTestDb, type TestDb } from '@fphd/db/testing';
import type postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { API_ROLES } from './bootstrap.ts';

const { SYSTEM_USER_IDS } = schema;

const ACTOR = SYSTEM_USER_IDS.pholioMigration;

const TABLE_PRIVILEGES = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
];

// public_api's own name is never used here: login roles are cluster-wide, so bootstrapping
// it would rotate the password the rest of the suite connects with. A throwaway member of
// the role inherits exactly the grants under test.
const memberRole = `fphd_grants_test_${randomBytes(6).toString('hex')}`;
const memberPassword = 'grants-test';

let testDb: TestDb;
let owner: postgres.Sql;
let member: postgres.Sql;
let draftIndicatorId: string;
let draftObservationId: string;

/** An observation with one dimension value and one note, in the batch given. */
async function insertObservation(
  indicatorId: string,
  batchId: string,
  fromDate: string,
): Promise<string> {
  const [observation] = await owner<{ id: string }[]>`
    WITH dv AS (SELECT id, dimension_type_id FROM dimension_value ORDER BY id LIMIT 1),
      o AS (
        INSERT INTO observation
          (indicator_id, area_id, from_date, to_date, value, upload_batch_id, dimension_key)
        SELECT ${indicatorId}, a.id, ${fromDate}, ${fromDate}::date + 364, 1.5, ${batchId},
               dv.id::text
        FROM (SELECT id FROM area ORDER BY id LIMIT 1) a, dv
        RETURNING id
      ),
      d AS (
        INSERT INTO observation_dimension (observation_id, dimension_value_id, dimension_type_id)
        SELECT o.id, dv.id, dv.dimension_type_id FROM o, dv
      )
    INSERT INTO observation_note (observation_id, note_type_id)
    SELECT o.id, (SELECT id FROM note_type ORDER BY id LIMIT 1) FROM o
    RETURNING observation_id AS id
  `;
  if (!observation) throw new Error('inserted no observation');
  return observation.id;
}

/** An indicator whose only version is a draft, with data and read-model rows behind it. */
async function insertDraftOnlyIndicator(): Promise<void> {
  const [indicator] = await owner<{ id: string }[]>`
    INSERT INTO indicator (short_id) VALUES (999997) RETURNING id
  `;
  draftIndicatorId = indicator?.id ?? '';

  const [version] = await owner<{ id: string }[]>`
    INSERT INTO indicator_version
      (indicator_id, status, name, slug, value_type_id, unit_id, period_type, year_type,
       polarity, update_frequency, definition, created_by, updated_by)
    SELECT ${draftIndicatorId}, 'draft', 'grants-test draft indicator',
           'grants-test-draft-indicator',
           vt.id, u.id, 'years', 'calendar', 'lower-is-better',
           'annually', 'a draft definition', ${ACTOR}, ${ACTOR}
    FROM value_type vt, unit u
    WHERE u.name <> 'Other'
    LIMIT 1
    RETURNING id
  `;
  const versionId = version?.id ?? '';

  await owner`
    INSERT INTO indicator_version_topic (topic_id, indicator_version_id)
    SELECT t.id, ${versionId} FROM topic t LIMIT 1
  `;
  await owner`
    INSERT INTO indicator_version_classification (indicator_version_id, classification_id)
    SELECT ${versionId}, c.id FROM classification c LIMIT 1
  `;
  await owner`
    INSERT INTO indicator_version_source (indicator_version_id, part, position, provider_id)
    SELECT ${versionId}, 'numerator', 0, p.id FROM data_provider p LIMIT 1
  `;

  const [batch] = await owner<{ id: string }[]>`
    INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by)
    VALUES (${draftIndicatorId}, ${versionId}, 'grants-test.csv', ${ACTOR})
    RETURNING id
  `;
  await owner`
    UPDATE indicator_version SET upload_batch_id = ${batch?.id ?? ''} WHERE id = ${versionId}
  `;
  draftObservationId = await insertObservation(draftIndicatorId, batch?.id ?? '', '2024-01-01');

  await owner`
    INSERT INTO latest_headline (indicator_id, area_id, from_date, to_date, value)
    SELECT ${draftIndicatorId}, a.id, '2024-01-01', '2024-12-31', 1.5 FROM area a LIMIT 1
  `;
  await owner`
    INSERT INTO available_data (indicator_id, area_type_id, area_type_name, area_count)
    SELECT ${draftIndicatorId}, at.id, at.name, 1 FROM area_type at LIMIT 1
  `;
  await owner`
    INSERT INTO indicator_dimension_values
      (indicator_id, dimension_type_id, dimension_type_name, dimension_value_id,
       dimension_value_name)
    SELECT ${draftIndicatorId}, dt.id, dt.name, dv.id, dv.name
    FROM dimension_value dv JOIN dimension_type dt ON dt.id = dv.dimension_type_id
    LIMIT 1
  `;
  await owner`
    INSERT INTO observation_range
      (indicator_id, display_group, from_date, to_date, segment, min, max)
    VALUES (${draftIndicatorId}, 'Local authorities', '2024-01-01', '2024-12-31', '', 1.5, 1.5)
  `;
}

beforeAll(async () => {
  testDb = await createTestDb({ template: 'seeded' });
  owner = testDb.sql;
  await owner.unsafe(
    `CREATE ROLE "${memberRole}" LOGIN PASSWORD '${memberPassword}' IN ROLE "${API_ROLES.publicApi}"`,
  );
  await insertDraftOnlyIndicator();
  member = testDb.connect({ login: { user: memberRole, password: memberPassword }, max: 1 });
});

afterAll(async () => {
  await member?.end();
  await owner.unsafe(`DROP ROLE IF EXISTS "${memberRole}"`);
  await testDb.drop();
});

// What the public API reads about an indicator; a change here changes its responses.
const PUBLISHED_INDICATOR_COLUMNS = [
  'indicator.id uuid',
  'indicator.short_id integer',
  'indicator.data_updated_at timestamp with time zone',
  'indicator.created_at timestamp with time zone',
  'indicator.name text',
  'indicator.slug text',
  'indicator.value_type_id uuid',
  'indicator.unit_id uuid',
  'indicator.unit_detail text',
  'indicator.year_type text',
  'indicator.year_end_day smallint',
  'indicator.year_end_month smallint',
  'indicator.ci_method_id uuid',
  'indicator.polarity text',
  'indicator.update_frequency text',
  'indicator.comparator_method_id uuid',
  'indicator.ci_confidence_level text',
  'indicator.definition text',
  'indicator.rationale text',
  'indicator.methodology text',
  'indicator.numerator_definition text',
  'indicator.denominator_definition text',
  'indicator.disclosure_control_detail text',
  'indicator.caveats_detail text',
  'indicator.other_notes_detail text',
  'indicator.data_source_id uuid',
  'indicator.updated_at timestamp with time zone',
  'indicator.first_published_at timestamp with time zone',
  'indicator.last_published_at timestamp with time zone',
  'indicator_classification.indicator_id uuid',
  'indicator_classification.classification_id uuid',
  'indicator_source.indicator_id uuid',
  'indicator_source.part text',
  'indicator_source.position smallint',
  'indicator_source.provider_id uuid',
  'indicator_source.source_id uuid',
  'indicator_topic.indicator_id uuid',
  'indicator_topic.topic_id uuid',
  'indicator_topic.is_primary boolean',
];

describe('the public role', () => {
  it('holds no privilege on any relation in the public schema', async () => {
    const held = await owner<{ relname: string; priv: string }[]>`
      SELECT c.relname, p.priv
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest(${owner.array(TABLE_PRIVILEGES)}::text[]) AS p(priv)
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
        AND has_table_privilege(${memberRole}, c.oid, p.priv)
      ORDER BY c.relname, p.priv
    `;

    expect(held).toEqual([]);
  });

  it('may select every view in the published schema and nothing more', async () => {
    const [usage] = await owner<{ granted: boolean }[]>`
      SELECT has_schema_privilege(${memberRole}, 'published', 'USAGE') AS granted
    `;
    expect(usage?.granted).toBe(true);

    const views = await owner<{ relname: string; readable: boolean; writable: boolean }[]>`
      SELECT
        c.relname,
        has_table_privilege(${memberRole}, c.oid, 'SELECT') AS readable,
        has_table_privilege(${memberRole}, c.oid, 'INSERT') AS writable
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'published' AND c.relkind = 'v'
    `;

    expect(views.length).toBeGreaterThan(0);
    expect(views.filter(({ readable }) => !readable)).toEqual([]);
    expect(views.filter(({ writable }) => writable)).toEqual([]);
  });

  // The catalogue check above could miss a privilege arriving some other way; a real read
  // cannot.
  it.each([
    'indicator',
    'indicator_version',
    'current_published_version',
    'observation',
    'data_migration',
  ])('is refused a direct read of %s', async (relation) => {
    await expect(member.unsafe(`SELECT 1 FROM public.${relation} LIMIT 1`)).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('reads the same columns of each indicator view as it always has', async () => {
    const columns = await member<{ table_name: string; column_name: string; data_type: string }[]>`
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'published'
        AND table_name IN (
          'indicator', 'indicator_topic', 'indicator_classification', 'indicator_source'
        )
      ORDER BY table_name, ordinal_position
    `;

    expect(columns.map((c) => `${c.table_name}.${c.column_name} ${c.data_type}`)).toEqual(
      PUBLISHED_INDICATOR_COLUMNS,
    );
  });

  it('reads no publication time on an observation, which the batch pointer replaces', async () => {
    const columns = await member<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'published' AND table_name = 'observation'
        AND column_name = 'published_at'
    `;

    expect(columns).toEqual([]);
  });

  it('sees no upload batch, which is internal detail', async () => {
    const columns = await member<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'published' AND column_name = 'upload_batch_id'
    `;

    expect(columns).toEqual([]);
  });
});

describe('the internal role', () => {
  // A view that is dropped and recreated loses its grants, so these are checked by name.
  it.each([
    'public.current_published_version',
    'published.indicator',
    'published.indicator_topic',
    'published.indicator_classification',
    'published.indicator_source',
    'published.data_provider',
    'published.data_provider_source',
    'public.data_provider',
    'public.data_provider_source',
    'public.team',
    'public.app_user',
  ])('may select %s', async (relation) => {
    const [row] = await owner<{ readable: boolean }[]>`
      SELECT has_table_privilege(${API_ROLES.internalApi}, ${relation}, 'SELECT') AS readable
    `;

    expect(row?.readable).toBe(true);
  });
  it('holds no privilege on the data migration ledger', async () => {
    const [row] = await owner<{ held: boolean }[]>`
      SELECT has_table_privilege(${API_ROLES.internalApi}, 'public.data_migration', 'SELECT')
        OR has_table_privilege(${API_ROLES.internalApi}, 'public.data_migration', 'INSERT') AS held
    `;

    expect(row?.held).toBe(false);
  });

  // Table-level, as the other publisher writes are.
  it.each(
    ['indicator_version_link', 'indicator_version_age_range', 'indicator_version_source'].flatMap(
      (table) => ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((privilege) => [privilege, table]),
    ),
  )('may %s %s', async (privilege, table) => {
    const [row] = await owner<{ granted: boolean }[]>`
      SELECT has_table_privilege(${API_ROLES.internalApi}, ${`public.${table}`}, ${privilege}) AS granted
    `;

    expect(row?.granted).toBe(true);
  });

  // The upload writes batches and their rows.
  it.each(
    ['observation', 'observation_dimension', 'observation_note', 'upload_batch'].flatMap((table) =>
      ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].map((privilege) => [privilege, table]),
    ),
  )('may %s %s', async (privilege, table) => {
    const [row] = await owner<{ granted: boolean }[]>`
      SELECT has_table_privilege(${API_ROLES.internalApi}, ${`public.${table}`}, ${privilege}) AS granted
    `;

    expect(row?.granted).toBe(true);
  });

  // The provider list is core data, which only the import writes; teams and users only migrations.
  it.each(['data_provider', 'data_provider_source', 'team', 'app_user'])(
    'may not write %s',
    async (table) => {
      const [row] = await owner<{ granted: boolean }[]>`
      SELECT has_table_privilege(${API_ROLES.internalApi}, ${`public.${table}`}, 'INSERT') AS granted
    `;

      expect(row?.granted).toBe(false);
    },
  );
});

describe('an indicator whose only version is a draft', () => {
  it('is invisible through every view the public role reads', async () => {
    const counts = await member<{ view: string; rows: number }[]>`
      SELECT 'indicator' AS view, count(*)::int AS rows
        FROM published.indicator WHERE id = ${draftIndicatorId}
      UNION ALL SELECT 'indicator_topic', count(*)::int
        FROM published.indicator_topic WHERE indicator_id = ${draftIndicatorId}
      UNION ALL SELECT 'indicator_classification', count(*)::int
        FROM published.indicator_classification WHERE indicator_id = ${draftIndicatorId}
      UNION ALL SELECT 'indicator_source', count(*)::int
        FROM published.indicator_source WHERE indicator_id = ${draftIndicatorId}
      UNION ALL SELECT 'indicator_slug', count(*)::int
        FROM published.indicator_slug
        WHERE indicator_id = ${draftIndicatorId} OR slug = 'grants-test-draft-indicator'
      UNION ALL SELECT 'observation', count(*)::int
        FROM published.observation WHERE indicator_id = ${draftIndicatorId}
      UNION ALL SELECT 'observation_dimension', count(*)::int
        FROM published.observation_dimension WHERE observation_id = ${draftObservationId}
      UNION ALL SELECT 'observation_note', count(*)::int
        FROM published.observation_note WHERE observation_id = ${draftObservationId}
      UNION ALL SELECT 'latest_headline', count(*)::int
        FROM published.latest_headline WHERE indicator_id = ${draftIndicatorId}
      UNION ALL SELECT 'available_data', count(*)::int
        FROM published.available_data WHERE indicator_id = ${draftIndicatorId}
      UNION ALL SELECT 'indicator_dimension_values', count(*)::int
        FROM published.indicator_dimension_values WHERE indicator_id = ${draftIndicatorId}
      UNION ALL SELECT 'observation_range', count(*)::int
        FROM published.observation_range WHERE indicator_id = ${draftIndicatorId}
    `;

    expect(counts.filter(({ rows }) => rows > 0)).toEqual([]);
    expect(counts).toHaveLength(12);
  });

  it.each(['latest_headline', 'available_data', 'indicator_dimension_values', 'observation_range'])(
    'serves every row %s holds for a published indicator',
    async (readModel) => {
      const [stored] = await owner.unsafe<{ rows: number }[]>(
        `SELECT count(*)::int AS rows FROM public.${readModel} WHERE indicator_id <> $1`,
        [draftIndicatorId],
      );
      const [served] = await member.unsafe<{ rows: number }[]>(
        `SELECT count(*)::int AS rows FROM published.${readModel}`,
      );

      expect(stored?.rows).toBeGreaterThan(0);
      expect(served?.rows).toBe(stored?.rows);
    },
  );

  it('does not stop the seeded published indicators being served', async () => {
    const [seeded] = await member<{ rows: number }[]>`
      SELECT count(*)::int AS rows FROM published.indicator
    `;

    expect(seeded?.rows).toBe(12);
  });
});

describe('a published indicator whose draft has a batch of its own', () => {
  let indicatorId: string;
  let pendingObservationId: string;

  beforeAll(async () => {
    const [published] = await owner<{ id: string; indicatorId: string }[]>`
      SELECT cpv.id, cpv.indicator_id AS "indicatorId"
      FROM current_published_version cpv ORDER BY cpv.indicator_id LIMIT 1
    `;
    if (!published) throw new Error('The seed holds no published version');
    indicatorId = published.indicatorId;

    const [draft] = await owner<{ id: string }[]>`
      INSERT INTO indicator_version (indicator_id, status, name, slug, created_by, updated_by)
      SELECT indicator_id, 'draft', name, slug, ${ACTOR}::uuid, ${ACTOR}::uuid
      FROM indicator_version WHERE id = ${published.id}
      RETURNING id
    `;
    const [batch] = await owner<{ id: string }[]>`
      INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by)
      VALUES (${indicatorId}, ${draft?.id ?? ''}, 'grants-test-update.csv', ${ACTOR})
      RETURNING id
    `;
    await owner`
      UPDATE indicator_version SET upload_batch_id = ${batch?.id ?? ''} WHERE id = ${draft?.id ?? ''}
    `;
    pendingObservationId = await insertObservation(indicatorId, batch?.id ?? '', '2099-01-01');
  });

  it("keeps the draft's rows out of every observation view", async () => {
    const counts = await member<{ view: string; rows: number }[]>`
      SELECT 'observation' AS view, count(*)::int AS rows
        FROM published.observation WHERE id = ${pendingObservationId}
      UNION ALL SELECT 'observation_dimension', count(*)::int
        FROM published.observation_dimension WHERE observation_id = ${pendingObservationId}
      UNION ALL SELECT 'observation_note', count(*)::int
        FROM published.observation_note WHERE observation_id = ${pendingObservationId}
    `;

    expect(counts.filter(({ rows }) => rows > 0)).toEqual([]);
    expect(counts).toHaveLength(3);
  });

  it('still serves every seeded row, all of them in the published batch', async () => {
    const [expected] = await owner<{ rows: number }[]>`
      SELECT count(*)::int AS rows FROM observation
      WHERE indicator_id = ${indicatorId} AND id <> ${pendingObservationId}
    `;
    const [served] = await member<{ rows: number }[]>`
      SELECT count(*)::int AS rows FROM published.observation WHERE indicator_id = ${indicatorId}
    `;

    expect(expected?.rows).toBeGreaterThan(0);
    expect(served?.rows).toBe(expected?.rows);
  });
});

describe('an indicator published again with new data', () => {
  let indicatorId: string;

  /** Publishes a version of the indicator with a batch of its own holding one row. */
  async function publishWithData(publishedAt: string, fromDate: string): Promise<string> {
    const [version] = await owner<{ id: string }[]>`
      INSERT INTO indicator_version
        (indicator_id, status, published_at, name, slug, created_by, updated_by)
      VALUES (${indicatorId}, 'published', ${publishedAt}, 'grants-test republished indicator',
              'grants-test-republished-indicator', ${ACTOR}, ${ACTOR})
      RETURNING id
    `;
    const [batch] = await owner<{ id: string }[]>`
      INSERT INTO upload_batch (indicator_id, indicator_version_id, original_filename, uploaded_by)
      VALUES (${indicatorId}, ${version?.id ?? ''}, 'grants-test.csv', ${ACTOR})
      RETURNING id
    `;
    await owner`
      UPDATE indicator_version SET upload_batch_id = ${batch?.id ?? ''} WHERE id = ${version?.id ?? ''}
    `;
    return insertObservation(indicatorId, batch?.id ?? '', fromDate);
  }

  beforeAll(async () => {
    const [indicator] = await owner<{ id: string }[]>`
      INSERT INTO indicator (short_id) VALUES (999996) RETURNING id
    `;
    indicatorId = indicator?.id ?? '';
  });

  /** The observation views that show the public role the observation given. */
  async function viewsShowing(id: string): Promise<string[]> {
    const rows = await member<{ view: string }[]>`
      SELECT 'observation' AS view FROM published.observation WHERE id = ${id}
      UNION ALL SELECT 'observation_dimension'
        FROM published.observation_dimension WHERE observation_id = ${id}
      UNION ALL SELECT 'observation_note'
        FROM published.observation_note WHERE observation_id = ${id}
    `;
    return rows.map(({ view }) => view).sort();
  }

  it("switches every observation view from the old batch's rows to the new one's", async () => {
    const everyView = ['observation', 'observation_dimension', 'observation_note'];
    const first = await publishWithData('2030-01-01T00:00:00Z', '2023-01-01');
    expect(await viewsShowing(first)).toEqual(everyView);

    const second = await publishWithData('2031-01-01T00:00:00Z', '2024-01-01');

    expect(await viewsShowing(first)).toEqual([]);
    expect(await viewsShowing(second)).toEqual(everyView);
  });
});

/**
 * A throwaway member of internal_api, for the same reason as the public role's above, connected
 * for the tests of one describe block.
 */
function internalMemberOfBlock(): () => postgres.Sql {
  const role = `fphd_grants_test_${randomBytes(6).toString('hex')}`;
  let client: postgres.Sql | undefined;

  beforeAll(async () => {
    await owner.unsafe(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${memberPassword}' IN ROLE "${API_ROLES.internalApi}"`,
    );
    client = testDb.connect({ login: { user: role, password: memberPassword }, max: 1 });
  });

  afterAll(async () => {
    await client?.end();
    await owner.unsafe(`DROP ROLE IF EXISTS "${role}"`);
  });

  return () => {
    if (client === undefined) throw new Error('the internal member is connected in beforeAll');
    return client;
  };
}

describe('the audit log', () => {
  const internal = internalMemberOfBlock();

  it('lets the internal role add an entry and read it back', async () => {
    const [entry] = await internal()<{ id: string }[]>`
      INSERT INTO audit_log (actor_id, action, entity_type, entity_id, changes)
      VALUES (${ACTOR}, 'topic.deleted', 'topic', uuidv7()::text, '{}')
      RETURNING id
    `;

    await expect(
      internal()`SELECT action FROM audit_log WHERE id = ${entry?.id ?? ''}`,
    ).resolves.toEqual([{ action: 'topic.deleted' }]);
  });

  it.each(['UPDATE', 'DELETE', 'TRUNCATE'])('holds no %s on it', async (privilege) => {
    const [row] = await owner<{ granted: boolean }[]>`
      SELECT has_table_privilege(${API_ROLES.internalApi}, 'public.audit_log', ${privilege}) AS granted
    `;

    expect(row?.granted).toBe(false);
  });

  it('refuses the internal role changing or removing an entry', async () => {
    await expect(internal()`UPDATE audit_log SET changes = '{}'`).rejects.toThrow(
      /permission denied/,
    );
    await expect(internal()`DELETE FROM audit_log`).rejects.toThrow(/permission denied/);
  });
});

describe('the review submissions', () => {
  const internal = internalMemberOfBlock();

  it('lets the internal role add a submission, read it and end it', async () => {
    const [submission] = await internal()<{ id: string }[]>`
      INSERT INTO indicator_version_submission
        (indicator_version_id, indicator_id, number, status, submitted_by)
      SELECT id, indicator_id, 1, 'submitted', ${ACTOR} FROM indicator_version
      WHERE indicator_id = ${draftIndicatorId}
      RETURNING id
    `;
    const id = submission?.id ?? '';
    await internal()`
      UPDATE indicator_version_submission
      SET status = 'withdrawn', ended_by = ${ACTOR}, ended_at = now()
      WHERE id = ${id}
    `;

    await expect(
      internal()`SELECT status FROM indicator_version_submission WHERE id = ${id}`,
    ).resolves.toEqual([{ status: 'withdrawn' }]);
  });

  it.each(['DELETE', 'TRUNCATE'])('holds no %s on them', async (privilege) => {
    const [row] = await owner<{ granted: boolean }[]>`
      SELECT has_table_privilege(${API_ROLES.internalApi}, 'public.indicator_version_submission', ${privilege}) AS granted
    `;

    expect(row?.granted).toBe(false);
  });

  it('refuses the internal role removing a submission', async () => {
    await expect(internal()`DELETE FROM indicator_version_submission`).rejects.toThrow(
      /permission denied/,
    );
  });

  it('refuses the public role reading them', async () => {
    await expect(member`SELECT id FROM indicator_version_submission`).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('the reviewer assignments', () => {
  const internal = internalMemberOfBlock();

  async function openSubmission(): Promise<string> {
    const [submission] = await owner<{ id: string }[]>`
      INSERT INTO indicator_version_submission
        (indicator_version_id, indicator_id, number, status, submitted_by)
      SELECT v.id, v.indicator_id,
        (SELECT coalesce(max(number), 0) + 1 FROM indicator_version_submission s
         WHERE s.indicator_version_id = v.id),
        'in_review', ${ACTOR}
      FROM indicator_version v WHERE v.indicator_id = ${draftIndicatorId}
      RETURNING id
    `;
    return submission?.id ?? '';
  }

  it('lets the internal role assign a reviewer, read the assignment and remove it', async () => {
    const id = await openSubmission();
    await internal()`
      INSERT INTO indicator_version_submission_reviewer
        (submission_id, reviewer_id, assigned_by)
      VALUES (${id}, ${ACTOR}, ${ACTOR})
    `;

    await expect(
      internal()`
        SELECT reviewer_id FROM indicator_version_submission_reviewer
        WHERE submission_id = ${id}
      `,
    ).resolves.toEqual([{ reviewer_id: ACTOR }]);
    await expect(
      internal()`
        DELETE FROM indicator_version_submission_reviewer
        WHERE submission_id = ${id} RETURNING reviewer_id
      `,
    ).resolves.toHaveLength(1);
  });

  it.each(['UPDATE', 'TRUNCATE'])('holds no %s on them', async (privilege) => {
    const [row] = await owner<{ granted: boolean }[]>`
      SELECT has_table_privilege(${API_ROLES.internalApi}, 'public.indicator_version_submission_reviewer', ${privilege}) AS granted
    `;

    expect(row?.granted).toBe(false);
  });

  it('refuses the public role reading them', async () => {
    await expect(
      member`SELECT reviewer_id FROM indicator_version_submission_reviewer`,
    ).rejects.toThrow(/permission denied/);
  });
});
