import { SLUG_MAX_LENGTH } from '@fphd/utils/slug';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from './client.ts';
import {
  ciMethod,
  classification,
  indicator,
  indicatorVersion,
  indicatorVersionClassification,
  indicatorVersionTopic,
  SYSTEM_USER_IDS,
  topic,
} from './schema/index.ts';
import { createTestDb, type TestDb } from './testing.ts';

const ACTOR = SYSTEM_USER_IDS.pholioMigration;

// Above every Fingertips number the seed carries over, the largest of which is 94,194.
const FIRST_MINTED_SHORT_ID = 100_000;

const UNIQUE_VIOLATION = '23505';
const NOT_NULL_VIOLATION = '23502';
const EXCLUSION_VIOLATION = '23P01';
const CHECK_VIOLATION = '23514';

let testDb: TestDb;
let db: Database;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
});

afterAll(async () => {
  await testDb.drop();
});

async function newIndicatorId(): Promise<string> {
  const [row] = await db.insert(indicator).values({}).returning({ id: indicator.id });
  if (!row) throw new Error('inserted no indicator');
  return row.id;
}

// A slug belongs to one indicator, so an unnamed version takes one keyed to its own. A
// published version says when, as the table insists, unless the caller says otherwise.
async function addVersion(
  indicatorId: string,
  status: 'draft' | 'published',
  values: Partial<typeof indicatorVersion.$inferInsert> = {},
) {
  return db
    .insert(indicatorVersion)
    .values({
      indicatorId,
      status,
      name: 'Schema test indicator',
      slug: `schema-test-${indicatorId}`,
      publishedAt: status === 'published' ? new Date() : null,
      createdBy: ACTOR,
      updatedBy: ACTOR,
      ...values,
    })
    .returning();
}

async function newTopicId(slug: string): Promise<string> {
  const [row] = await db
    .insert(topic)
    .values({ slug, title: slug, description: slug, createdBy: ACTOR, updatedBy: ACTOR })
    .returning({ id: topic.id });
  if (!row) throw new Error('inserted no topic');
  return row.id;
}

async function newClassificationId(slug: string): Promise<string> {
  const [row] = await db
    .insert(classification)
    .values({ dimension: 'population', slug, name: slug })
    .returning({ id: classification.id });
  if (!row) throw new Error('inserted no classification');
  return row.id;
}

describe('a stub indicator', () => {
  it('needs nothing but a name and an actor on its first draft', async () => {
    const indicatorId = await newIndicatorId();

    const [version] = await addVersion(indicatorId, 'draft');

    expect(indicatorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(version?.status).toBe('draft');
    expect(version?.name).toBe('Schema test indicator');
    expect(version?.valueTypeId).toBeNull();
    expect(version?.publishedAt).toBeNull();
  });

  it('takes its short id from the sequence, so the next one differs', async () => {
    const [first] = await db.insert(indicator).values({}).returning();
    const [second] = await db.insert(indicator).values({}).returning();

    expect(second?.shortId).toBeGreaterThanOrEqual(FIRST_MINTED_SHORT_ID);
    expect(second?.shortId).toBe((first?.shortId ?? 0) + 1);
  });
});

describe('indicator_version', () => {
  it('allows one draft per indicator', async () => {
    const indicatorId = await newIndicatorId();
    await addVersion(indicatorId, 'draft');

    await expect(addVersion(indicatorId, 'draft')).rejects.toMatchObject({
      cause: { code: UNIQUE_VIOLATION },
    });
  });

  it('allows several published versions per indicator', async () => {
    const indicatorId = await newIndicatorId();
    await addVersion(indicatorId, 'published');

    await expect(addVersion(indicatorId, 'published')).resolves.toHaveLength(1);
  });

  // Raw SQL because the insert type no longer lets a caller omit the name.
  it('refuses a version with no name', async () => {
    const indicatorId = await newIndicatorId();

    await expect(
      db.execute(
        sql`INSERT INTO indicator_version (indicator_id, created_by, updated_by)
            VALUES (${indicatorId}, ${ACTOR}, ${ACTOR})`,
      ),
    ).rejects.toMatchObject({ cause: { code: NOT_NULL_VIOLATION } });
  });

  it('ties the publication timestamp to the status', async () => {
    const indicatorId = await newIndicatorId();

    await expect(addVersion(indicatorId, 'published', { publishedAt: null })).rejects.toMatchObject(
      { cause: { code: CHECK_VIOLATION } },
    );
    await expect(
      addVersion(indicatorId, 'draft', { publishedAt: new Date() }),
    ).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it('holds a polarity only as one of the service values', async () => {
    const indicatorId = await newIndicatorId();
    const [draft] = await addVersion(indicatorId, 'draft');
    if (!draft) throw new Error('inserted no version');

    await db.execute(
      sql`UPDATE indicator_version SET polarity = 'no-polarity' WHERE id = ${draft.id}`,
    );
    await expect(
      db.execute(
        sql`UPDATE indicator_version SET polarity = 'RAG - Low is good' WHERE id = ${draft.id}`,
      ),
    ).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it('holds an update frequency only as one of the service values', async () => {
    const indicatorId = await newIndicatorId();
    const [draft] = await addVersion(indicatorId, 'draft');
    if (!draft) throw new Error('inserted no version');

    await db.execute(
      sql`UPDATE indicator_version SET update_frequency = 'no-longer-updated' WHERE id = ${draft.id}`,
    );
    await expect(
      db.execute(
        sql`UPDATE indicator_version SET update_frequency = 'Annual' WHERE id = ${draft.id}`,
      ),
    ).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it.each([
    ['months', { periodType: 'months' }],
    ['quarters of a year type', { periodType: 'quarters', yearType: 'financial' }],
    [
      'years ending on 29 February',
      { periodType: 'years', yearType: 'specified-end-date', yearEndDay: 29, yearEndMonth: 2 },
    ],
  ] as const)('holds a period type of %s', async (_, values) => {
    await expect(addVersion(await newIndicatorId(), 'draft', values)).resolves.toHaveLength(1);
  });

  // Each case names the check that refuses it; Postgres tries the checks in name order.
  it.each([
    ['a period type the service does not know', { periodType: 'weeks' }, 'period_type'],
    [
      'a year type the service does not know',
      { periodType: 'years', yearType: 'survey' },
      'year_type',
    ],
    ['a year type on months', { periodType: 'months', yearType: 'calendar' }, 'year_type_period'],
    ['no year type on years', { periodType: 'years' }, 'year_type_period'],
    ['a year type with no period type', { yearType: 'calendar' }, 'year_type_period'],
    [
      'a year end on a calendar year',
      { periodType: 'years', yearType: 'calendar', yearEndDay: 31, yearEndMonth: 7 },
      'year_end',
    ],
    [
      'no year end on a year ending on a date',
      { periodType: 'years', yearType: 'specified-end-date' },
      'year_end',
    ],
    [
      'half a year end',
      { periodType: 'years', yearType: 'specified-end-date', yearEndDay: 31 },
      'year_end',
    ],
    [
      '31 February',
      { periodType: 'years', yearType: 'specified-end-date', yearEndDay: 31, yearEndMonth: 2 },
      'year_end_date',
    ],
  ] as const)('refuses %s', async (_, values, check) => {
    await expect(
      addVersion(await newIndicatorId(), 'draft', values as never),
    ).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION, constraint_name: `indicator_version_${check}_check` },
    });
  });

  it('allows a draft alongside the published version', async () => {
    const indicatorId = await newIndicatorId();

    await addVersion(indicatorId, 'published');

    await expect(addVersion(indicatorId, 'draft')).resolves.toHaveLength(1);
  });

  it('lets every version of one indicator share a slug', async () => {
    const indicatorId = await newIndicatorId();
    await addVersion(indicatorId, 'published', { slug: 'a-shared-slug' });

    await expect(addVersion(indicatorId, 'draft', { slug: 'a-shared-slug' })).resolves.toHaveLength(
      1,
    );
  });

  it('refuses a slug another indicator already holds, draft or published', async () => {
    const owner = await newIndicatorId();
    const other = await newIndicatorId();
    await addVersion(owner, 'draft', { slug: 'a-claimed-slug' });

    await expect(addVersion(other, 'published', { slug: 'a-claimed-slug' })).rejects.toMatchObject({
      cause: { code: EXCLUSION_VIOLATION },
    });
  });

  it('releases a slug when the draft holding it is deleted', async () => {
    const owner = await newIndicatorId();
    const other = await newIndicatorId();
    const [draft] = await addVersion(owner, 'draft', { slug: 'a-released-slug' });
    await db.delete(indicatorVersion).where(eq(indicatorVersion.id, draft?.id ?? ''));

    await expect(addVersion(other, 'draft', { slug: 'a-released-slug' })).resolves.toHaveLength(1);
  });

  it.each([
    ['digits only, which reads as a short id', '90366'],
    ['in upper case', 'Life-expectancy'],
    ['with a space', 'life expectancy'],
    ['longer than the limit', 'a'.repeat(SLUG_MAX_LENGTH + 1)],
  ])('refuses a slug %s', async (_, slug) => {
    const indicatorId = await newIndicatorId();

    await expect(addVersion(indicatorId, 'draft', { slug })).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION },
    });
  });

  it('accepts a slug at the length limit', async () => {
    const indicatorId = await newIndicatorId();

    await expect(
      addVersion(indicatorId, 'draft', { slug: 'a'.repeat(SLUG_MAX_LENGTH) }),
    ).resolves.toHaveLength(1);
  });

  // Raw SQL because the insert type only lets a caller name the allowed values.
  it('refuses anyone but OHID, DHSC or other organisations as who calculated it', async () => {
    const indicatorId = await newIndicatorId();
    const [draft] = await addVersion(indicatorId, 'draft');

    await expect(
      db.execute(
        sql`UPDATE indicator_version SET calculated_by = 'nhs' WHERE id = ${draft?.id ?? ''}`,
      ),
    ).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it.each([
    ['ohid', {}],
    ['dhsc', {}],
    ['other', { calculatedByDetail: 'ONS' }],
  ] as const)('accepts %s as who calculated it', async (calculatedBy, detail) => {
    const indicatorId = await newIndicatorId();

    await expect(
      addVersion(indicatorId, 'draft', { calculatedBy, ...detail }),
    ).resolves.toHaveLength(1);
  });

  it.each([
    ['nobody', null],
    ['OHID', 'ohid'],
    ['DHSC', 'dhsc'],
  ] as const)('refuses other organisations beside %s', async (_, calculatedBy) => {
    const indicatorId = await newIndicatorId();

    await expect(
      addVersion(indicatorId, 'draft', { calculatedBy, calculatedByDetail: 'ONS' }),
    ).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it('refuses "other" with no organisations named, as the contract does', async () => {
    await expect(
      addVersion(await newIndicatorId(), 'draft', { calculatedBy: 'other' }),
    ).rejects.toMatchObject({
      cause: {
        code: CHECK_VIOLATION,
        constraint_name: 'indicator_version_calculated_by_detail_check',
      },
    });
  });

  it('refuses a disclosure control answer the publisher form does not offer', async () => {
    const [draft] = await addVersion(await newIndicatorId(), 'draft');

    await expect(
      db.execute(
        sql`UPDATE indicator_version SET disclosure_control = 'Not applied' WHERE id = ${draft?.id ?? ''}`,
      ),
    ).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });

  it.each([
    ['disclosure control of nobody', { disclosureControlDetail: 'Suppressed' }],
    ['disclosure control that is no', { disclosureControl: 'no', disclosureControlDetail: 'x' }],
    [
      'disclosure control that is not applicable',
      { disclosureControl: 'not-applicable', disclosureControlDetail: 'x' },
    ],
    ['rounding not applied', { hasRounding: false, roundingDetail: 'To the nearest 5' }],
    ['caveats of nobody', { caveatsDetail: 'Survey data' }],
    ['caveats not needed', { hasCaveats: false, caveatsDetail: 'Survey data' }],
    ['other notes not needed', { hasOtherNotes: false, otherNotesDetail: 'Revised' }],
    ['source data issues of nobody', { sourceDataIssuesDetail: 'Late returns' }],
    [
      'source data without issues',
      { hasSourceDataIssues: false, sourceDataIssuesDetail: 'Late returns' },
    ],
    ['exclusions of nobody', { exclusionsDetail: 'Small areas' }],
    ['no exclusions', { hasExclusions: false, exclusionsDetail: 'Small areas' }],
    ['automation of nobody', { automationDetail: 'Pipeline' }],
    ['no automation', { hasAutomation: false, automationDetail: 'Pipeline' }],
    ['reviewer comments of nobody', { reviewerCommentsDetail: 'Replaces 108' }],
    [
      'no reviewer comments',
      { hasReviewerComments: false, reviewerCommentsDetail: 'Replaces 108' },
    ],
    ['copyright of nobody', { customCopyrightDetail: 'NHS England' }],
    ['the default copyright', { hasCustomCopyright: false, customCopyrightDetail: 'NHS England' }],
    ['data re-use of nobody', { customDataReuseDetail: 'Cite NHS England' }],
    [
      'the default data re-use',
      { hasCustomDataReuse: false, customDataReuseDetail: 'Cite NHS England' },
    ],
  ] as const)('refuses a detail beside %s', async (_, values) => {
    await expect(addVersion(await newIndicatorId(), 'draft', values)).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION },
    });
  });

  it('accepts a detail beside a yes', async () => {
    await expect(
      addVersion(await newIndicatorId(), 'draft', {
        disclosureControl: 'yes',
        disclosureControlDetail: 'Suppressed',
        hasRounding: true,
        roundingDetail: 'To the nearest 5',
        hasCaveats: true,
        caveatsDetail: 'Survey data',
        hasOtherNotes: true,
        otherNotesDetail: 'Revised',
        hasSourceDataIssues: true,
        sourceDataIssuesDetail: 'Late returns',
        hasExclusions: true,
        exclusionsDetail: 'Small areas',
        hasAutomation: true,
        automationDetail: 'Pipeline',
        hasReviewerComments: true,
        reviewerCommentsDetail: 'Replaces 108',
        hasCustomCopyright: true,
        customCopyrightDetail: 'NHS England',
        hasCustomDataReuse: true,
        customDataReuseDetail: 'Cite NHS England',
        hasCiMethodModifications: true,
        ciMethodModificationsDetail: 'Adjusted for repeat admissions',
      }),
    ).resolves.toHaveLength(1);
  });

  // The contract requires each of these details beside a yes, so the table does too.
  it.each([
    ['disclosure control', { disclosureControl: 'yes' }, 'disclosure_control_detail'],
    ['rounding', { hasRounding: true }, 'rounding_detail'],
    ['caveats', { hasCaveats: true }, 'caveats_detail'],
    ['other notes', { hasOtherNotes: true }, 'other_notes_detail'],
    ['source data issues', { hasSourceDataIssues: true }, 'source_data_issues_detail'],
    ['exclusions', { hasExclusions: true }, 'exclusions_detail'],
    ['automation', { hasAutomation: true }, 'automation_detail'],
    ['reviewer comments', { hasReviewerComments: true }, 'reviewer_comments_detail'],
    ['a custom copyright', { hasCustomCopyright: true }, 'custom_copyright_detail'],
    ['custom data re-use', { hasCustomDataReuse: true }, 'custom_data_reuse_detail'],
    [
      'CI method modifications',
      { hasCiMethodModifications: true },
      'ci_method_modifications_detail',
    ],
  ] as const)('refuses a yes to %s without its detail', async (_, values, check) => {
    await expect(addVersion(await newIndicatorId(), 'draft', values)).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION, constraint_name: `indicator_version_${check}_check` },
    });
  });

  const goal = {
    hasGoalBenchmark: true,
    goalLowerValue: 90,
    goalUpperValue: 95,
    goalPolarity: 'higher-is-better',
    goalPolicyDetail: 'The national immunisation programme target.',
  } as const;

  it.each([
    ['a goal', goal],
    [
      'a single goal value without detail',
      { ...goal, goalUpperValue: null, goalPolicyDetail: null },
    ],
    ['a negative goal', { ...goal, goalLowerValue: -2.5, goalUpperValue: -0.5 }],
    ['no goal', { hasGoalBenchmark: false }],
  ] as const)('accepts %s', async (_, values) => {
    await expect(addVersion(await newIndicatorId(), 'draft', values)).resolves.toHaveLength(1);
  });

  // Each case names the check that refuses it; Postgres tries the checks in name order.
  it.each([
    ['a yes without its goal', { hasGoalBenchmark: true }, 'goal'],
    ['a goal beside no', { ...goal, hasGoalBenchmark: false }, 'goal'],
    ['a goal of nobody', { ...goal, hasGoalBenchmark: null }, 'goal'],
    ['a goal without its lower value', { ...goal, goalLowerValue: null }, 'goal'],
    ['a goal without its polarity', { ...goal, goalPolarity: null }, 'goal_pair'],
    [
      'a polarity beside no',
      { hasGoalBenchmark: false, goalPolarity: 'higher-is-better' },
      'goal_pair',
    ],
    [
      'a detail beside no goal',
      { hasGoalBenchmark: false, goalPolicyDetail: 'A target' },
      'goal_policy_detail',
    ],
    ['an upper value equal to the lower', { ...goal, goalUpperValue: 90 }, 'goal_upper_value'],
    ['an upper value below the lower', { ...goal, goalUpperValue: 85 }, 'goal_upper_value'],
    [
      'an upper value beside no',
      { hasGoalBenchmark: false, goalUpperValue: 5 },
      'goal_upper_value',
    ],
    [
      'a lower value that is no number, beside an upper',
      { ...goal, goalLowerValue: Number.NaN },
      'goal_upper_value',
    ],
    [
      'an infinite lower value',
      { ...goal, goalLowerValue: Number.NEGATIVE_INFINITY },
      'goal_values',
    ],
    [
      'an infinite single value',
      { ...goal, goalUpperValue: null, goalLowerValue: Number.POSITIVE_INFINITY },
      'goal_values',
    ],
    [
      'an infinite upper value',
      { ...goal, goalUpperValue: Number.POSITIVE_INFINITY },
      'goal_values',
    ],
    [
      'a single value that is no number',
      { ...goal, goalUpperValue: null, goalLowerValue: Number.NaN },
      'goal_values',
    ],
    ['an upper value that is no number', { ...goal, goalUpperValue: Number.NaN }, 'goal_values'],
  ] as const)('refuses %s', async (_, values, check) => {
    await expect(addVersion(await newIndicatorId(), 'draft', values)).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION, constraint_name: `indicator_version_${check}_check` },
    });
  });

  it.each(['no-polarity', 'no-comparison-possible', 'high-is-good'])(
    'refuses a goal polarity of %s',
    async (polarity) => {
      const [draft] = await addVersion(await newIndicatorId(), 'draft', goal);

      await expect(
        db.execute(
          sql`UPDATE indicator_version SET goal_polarity = ${polarity} WHERE id = ${draft?.id ?? ''}`,
        ),
      ).rejects.toMatchObject({
        cause: { code: CHECK_VIOLATION, constraint_name: 'indicator_version_goal_polarity_check' },
      });
    },
  );

  // Raw SQL because the insert type no longer lets a caller omit the slug.
  it('refuses a version with no slug', async () => {
    const indicatorId = await newIndicatorId();

    await expect(
      db.execute(
        sql`INSERT INTO indicator_version (indicator_id, name, created_by, updated_by)
            VALUES (${indicatorId}, 'no slug', ${ACTOR}, ${ACTOR})`,
      ),
    ).rejects.toMatchObject({ cause: { code: NOT_NULL_VIOLATION } });
  });
});

describe("a version's child tables", () => {
  // Postgres cuts a name at 63 bytes, which would cut the "_fk" off a generated one.
  it('name every foreign key in full', async () => {
    const keys = await db.execute<{ name: string }>(sql`
      SELECT conname AS name FROM pg_constraint
      WHERE contype = 'f' AND conrelid::regclass::text LIKE 'indicator_version_%'
      ORDER BY conname
    `);

    expect(keys.map(({ name }) => name)).toEqual([
      'indicator_version_age_range_version_fk',
      'indicator_version_classification_classification_fk',
      'indicator_version_classification_version_fk',
      'indicator_version_link_version_fk',
      'indicator_version_source_provider_fk',
      'indicator_version_source_source_fk',
      'indicator_version_source_version_fk',
      'indicator_version_submission_ended_by_fk',
      'indicator_version_submission_reviewer_assigned_by_fk',
      'indicator_version_submission_reviewer_reviewer_fk',
      'indicator_version_submission_reviewer_submission_fk',
      'indicator_version_submission_submitted_by_fk',
      'indicator_version_submission_version_fk',
      'indicator_version_subtopic_subtopic_fk',
      'indicator_version_subtopic_topic_fk',
      'indicator_version_topic_topic_fk',
      'indicator_version_topic_version_fk',
    ]);
  });
});

describe('constraint names', () => {
  // A renamed table keeps its constraints' names, and Postgres cuts a long one at 63 bytes.
  it("start with their table's name and are never cut short", async () => {
    const misnamed = await db.execute<{ name: string }>(sql`
      SELECT conname AS name FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND conrelid <> 0
        AND (left(conname, length(conrelid::regclass::text) + 1) <> conrelid::regclass::text || '_'
          OR octet_length(conname) >= 63)
    `);

    expect(misnamed.map(({ name }) => name)).toEqual([]);
  });
});

describe('length checks', () => {
  // How long an answer may be is the contract's rule; a slug's length is part of its format.
  it("hold no text to a length but the slug's", async () => {
    const checks = await db.execute<{ name: string }>(sql`
      SELECT conname AS name FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND contype = 'c'
        AND pg_get_constraintdef(oid) ~* '\\mlength\\('
      ORDER BY conname
    `);

    expect(checks.map(({ name }) => name)).toEqual(['indicator_version_slug_check']);
  });
});

describe('ci_method', () => {
  it('takes a method as standard unless told otherwise', async () => {
    const [row] = await db
      .insert(ciMethod)
      .values({ name: 'A method of no particular kind' })
      .returning({ kind: ciMethod.kind });

    expect(row?.kind).toBe('standard');
  });

  it('refuses a kind the publisher form does not know', async () => {
    await expect(
      db.execute(sql`INSERT INTO ci_method (name, kind) VALUES ('A strange method', 'strange')`),
    ).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
  });
});

describe('the published views', () => {
  // A new version column must not change the view, or the views built on it with it.
  it('name the current published version by its id alone', async () => {
    const columns = (await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'current_published_version'
          ORDER BY ordinal_position`,
    )) as unknown as { column_name: string }[];

    expect(columns.map((row) => row.column_name)).toEqual(['id', 'indicator_id']);
  });

  it('show the most recently published version, memberships and all', async () => {
    const indicatorId = await newIndicatorId();
    const currentTopic = await newTopicId('current-topic');
    const supersededTopic = await newTopicId('superseded-topic');
    const currentClass = await newClassificationId('current-class');
    const supersededClass = await newClassificationId('superseded-class');

    // The newer publication is inserted first, so its UUIDv7 id sorts below the older
    // one's and published_at is the only thing that can pick the right row.
    const [current] = await addVersion(indicatorId, 'published', {
      name: 'Current',
      slug: 'current-name',
      publishedAt: new Date('2026-06-01T00:00:00Z'),
    });
    const [superseded] = await addVersion(indicatorId, 'published', {
      name: 'Superseded',
      slug: 'superseded-name',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    });
    if (!current || !superseded) throw new Error('inserted no versions');
    expect(superseded.id > current.id).toBe(true);

    await db.insert(indicatorVersionTopic).values([
      { topicId: currentTopic, indicatorVersionId: current.id },
      { topicId: supersededTopic, indicatorVersionId: superseded.id },
    ]);
    await db.insert(indicatorVersionClassification).values([
      { classificationId: currentClass, indicatorVersionId: current.id },
      { classificationId: supersededClass, indicatorVersionId: superseded.id },
    ]);

    const indicators = (await db.execute(
      sql`SELECT name, slug, first_published_at, last_published_at FROM published.indicator
          WHERE id = ${indicatorId}`,
      // Raw SQL, so the driver hands back timestamps as strings.
    )) as unknown as {
      name: string;
      slug: string;
      first_published_at: string;
      last_published_at: string;
    }[];
    const topics = (await db.execute(
      sql`SELECT topic_id FROM published.indicator_topic WHERE indicator_id = ${indicatorId}`,
    )) as unknown as { topic_id: string }[];
    const classifications = (await db.execute(
      sql`SELECT classification_id FROM published.indicator_classification
          WHERE indicator_id = ${indicatorId}`,
    )) as unknown as { classification_id: string }[];

    expect(indicators).toHaveLength(1);
    expect(indicators[0]?.name).toBe('Current');
    expect(indicators[0]?.slug).toBe('current-name');
    expect(new Date(indicators[0]?.first_published_at ?? '').toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(new Date(indicators[0]?.last_published_at ?? '').toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    );
    expect(topics.map((row) => row.topic_id)).toEqual([currentTopic]);
    expect(classifications.map((row) => row.classification_id)).toEqual([currentClass]);
  });

  it('resolve every slug a published version carries, not only the current one', async () => {
    const indicatorId = await newIndicatorId();
    await addVersion(indicatorId, 'published', {
      slug: 'renamed-indicator',
      publishedAt: new Date('2026-06-01T00:00:00Z'),
    });
    await addVersion(indicatorId, 'published', {
      slug: 'original-indicator',
      publishedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await addVersion(indicatorId, 'draft', { slug: 'renamed-indicator' });

    const rows = (await db.execute(
      sql`SELECT slug FROM published.indicator_slug WHERE indicator_id = ${indicatorId}
          ORDER BY slug`,
    )) as unknown as { slug: string }[];

    expect(rows.map((row) => row.slug)).toEqual(['original-indicator', 'renamed-indicator']);
  });

  it('keep who calculated an indicator off the public surface', async () => {
    const rows = (await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'published' AND column_name LIKE 'calculated_by%'`,
    )) as unknown as { column_name: string }[];

    expect(rows).toEqual([]);
  });

  it('keep the confidence interval follow-up answers and method kinds off the public surface', async () => {
    const rows = (await db.execute(
      sql`SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'published'
            AND (column_name LIKE 'ci_method_%' OR (table_name = 'ci_method' AND column_name = 'kind'))
          ORDER BY table_name, column_name`,
    )) as unknown as { table_name: string; column_name: string }[];

    expect(rows).toEqual([{ table_name: 'indicator', column_name: 'ci_method_id' }]);
  });

  it('keep the notes and caveats answers and the rounding off the public surface', async () => {
    const rows = (await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'published' AND table_name = 'indicator'
            AND column_name ~ '^(disclosure_control|rounding|caveats|other_notes)'
          ORDER BY ordinal_position`,
    )) as unknown as { column_name: string }[];

    expect(rows.map((row) => row.column_name)).toEqual([
      'disclosure_control_detail',
      'caveats_detail',
      'other_notes_detail',
    ]);
  });

  it('keep the notes for reviewers off the public surface', async () => {
    const rows = (await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'published'
            AND column_name IN (
              'variation', 'quality_assurance', 'has_source_data_issues', 'source_data_issues_detail',
              'ci_method_justification', 'data_sources_justification', 'inequalities_included',
              'has_exclusions', 'exclusions_detail', 'has_automation', 'automation_detail',
              'sponsors_and_stakeholders', 'has_reviewer_comments', 'reviewer_comments_detail'
            )`,
    )) as unknown as { column_name: string }[];

    expect(rows).toEqual([]);
  });

  it('keep whether there are data quality issues off the public surface', async () => {
    const rows = (await db.execute(
      sql`SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'published' AND column_name LIKE 'data_quality%'`,
    )) as unknown as { table_name: string; column_name: string }[];

    expect(rows).toEqual([]);
  });

  it('hide a slug only a draft carries', async () => {
    const indicatorId = await newIndicatorId();
    await addVersion(indicatorId, 'draft', { slug: 'an-unpublished-slug' });

    const rows = (await db.execute(
      sql`SELECT slug FROM published.indicator_slug WHERE slug = 'an-unpublished-slug'`,
    )) as unknown as { slug: string }[];

    expect(rows).toEqual([]);
  });
});
