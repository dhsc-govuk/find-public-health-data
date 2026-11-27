import { SLUG_MAX_LENGTH } from '@fphd/utils/slug';
import { UPDATE_FREQUENCIES } from '@fphd/utils/update-frequency';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from './client.ts';
import {
  ciMethod,
  classification,
  dataProvider,
  IMPORTED_INDICATOR_TEAM_ID,
  type IndicatorVersionStatus,
  indicator,
  indicatorVersion,
  indicatorVersionClassification,
  indicatorVersionDataValue,
  indicatorVersionGoal,
  indicatorVersionSource,
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
  const [row] = await db
    .insert(indicator)
    .values({ teamId: IMPORTED_INDICATOR_TEAM_ID })
    .returning({ id: indicator.id });
  if (!row) throw new Error('inserted no indicator');
  return row.id;
}

// A slug belongs to one indicator, so an unnamed version takes one keyed to its own. A
// published version says when, as the table insists, unless the caller says otherwise.
async function addVersion(
  indicatorId: string,
  status: IndicatorVersionStatus,
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
    .values({ dimension: 'population', slug, name: slug, position: 0 })
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
    const team = { teamId: IMPORTED_INDICATOR_TEAM_ID };
    const [first] = await db.insert(indicator).values(team).returning();
    const [second] = await db.insert(indicator).values(team).returning();

    expect(second?.shortId).toBeGreaterThanOrEqual(FIRST_MINTED_SHORT_ID);
    expect(second?.shortId).toBe((first?.shortId ?? 0) + 1);
  });

  it('refuses an indicator without a team', async () => {
    await expect(db.execute(sql`INSERT INTO indicator DEFAULT VALUES`)).rejects.toMatchObject({
      cause: { code: NOT_NULL_VIOLATION, column_name: 'team_id' },
    });
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

  it('allows one unpublished version per indicator, draft or scheduled', async () => {
    const scheduledFirst = await newIndicatorId();
    const draftFirst = await newIndicatorId();
    await addVersion(scheduledFirst, 'scheduled');
    await addVersion(draftFirst, 'draft');

    await expect(addVersion(scheduledFirst, 'draft')).rejects.toMatchObject({
      cause: { code: UNIQUE_VIOLATION },
    });
    await expect(addVersion(draftFirst, 'scheduled')).rejects.toMatchObject({
      cause: { code: UNIQUE_VIOLATION },
    });
  });

  it('allows a scheduled version alongside the published one', async () => {
    const indicatorId = await newIndicatorId();
    await addVersion(indicatorId, 'published');

    await expect(addVersion(indicatorId, 'scheduled')).resolves.toHaveLength(1);
  });

  it('refuses a status the workflow does not have', async () => {
    await expect(
      addVersion(await newIndicatorId(), 'approved' as IndicatorVersionStatus),
    ).rejects.toMatchObject({ cause: { code: CHECK_VIOLATION } });
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
    ['no-fixed-frequency', 'Published when the survey runs.'],
    ['no-longer-updated', 'The survey has ended.'],
    ['no-fixed-frequency', null],
    ['no-longer-updated', null],
  ] as const)('holds %s with the reason %j', async (updateFrequency, updateFrequencyReason) => {
    await expect(
      addVersion(await newIndicatorId(), 'draft', { updateFrequency, updateFrequencyReason }),
    ).resolves.toHaveLength(1);
  });

  it.each([2, 3, 99])('holds a frequency of every %i years', async (updateFrequencyYears) => {
    await expect(
      addVersion(await newIndicatorId(), 'draft', {
        updateFrequency: 'every-n-years',
        updateFrequencyYears,
      }),
    ).resolves.toHaveLength(1);
  });

  it.each([
    ['without its number of years', { updateFrequency: 'every-n-years' }],
    ['of 1 year', { updateFrequency: 'every-n-years', updateFrequencyYears: 1 }],
    ['of 100 years', { updateFrequency: 'every-n-years', updateFrequencyYears: 100 }],
    ['beside annually', { updateFrequency: 'annually', updateFrequencyYears: 2 }],
    ['beside an unanswered frequency', { updateFrequencyYears: 2 }],
  ] as const)('refuses a frequency of years %s', async (_, values) => {
    await expect(addVersion(await newIndicatorId(), 'draft', values)).rejects.toMatchObject({
      cause: {
        code: CHECK_VIOLATION,
        constraint_name: 'indicator_version_update_frequency_years_check',
      },
    });
  });

  it('holds an other frequency with its description', async () => {
    await expect(
      addVersion(await newIndicatorId(), 'draft', {
        updateFrequency: 'other',
        updateFrequencyText: 'Academic year, published in winter.',
      }),
    ).resolves.toHaveLength(1);
  });

  it.each([
    ['other without its description', { updateFrequency: 'other' }],
    ...UPDATE_FREQUENCIES.filter((frequency) => frequency !== 'other').map(
      (updateFrequency) =>
        [
          `a description beside ${updateFrequency}`,
          {
            updateFrequency,
            updateFrequencyYears: updateFrequency === 'every-n-years' ? 2 : null,
            updateFrequencyText: 'Academic year, published in winter.',
          },
        ] as const,
    ),
    [
      'a description beside an unanswered frequency',
      { updateFrequencyText: 'Academic year, published in winter.' },
    ],
  ] as const)('refuses %s', async (_, values) => {
    await expect(addVersion(await newIndicatorId(), 'draft', values)).rejects.toMatchObject({
      cause: {
        code: CHECK_VIOLATION,
        constraint_name: 'indicator_version_update_frequency_text_check',
      },
    });
  });

  it.each([
    ['an unanswered frequency', {}],
    ['monthly', { updateFrequency: 'monthly' }],
    ['quarterly', { updateFrequency: 'quarterly' }],
    ['annually', { updateFrequency: 'annually' }],
    ['every-n-years', { updateFrequency: 'every-n-years', updateFrequencyYears: 2 }],
    ['other', { updateFrequency: 'other', updateFrequencyText: 'Academic year.' }],
  ] as const)('refuses a reason for the update frequency beside %s', async (_, values) => {
    await expect(
      addVersion(await newIndicatorId(), 'draft', {
        ...values,
        updateFrequencyReason: 'Published when the survey runs.',
      }),
    ).rejects.toMatchObject({
      cause: {
        code: CHECK_VIOLATION,
        constraint_name: 'indicator_version_update_frequency_reason_check',
      },
    });
  });

  const singleYears = { timePeriods: ['single-years'] };
  const multipleYears = { timePeriods: ['multiple-years'], multipleYearsCount: 3 };
  const dateRange = {
    timePeriods: ['date-range'],
    dateRangeStartDay: 1,
    dateRangeStartMonth: 10,
    dateRangeEndDay: 31,
    dateRangeEndMonth: 3,
  };

  it.each([
    ['quarters and months', { timePeriods: ['quarters', 'months'] }],
    [
      'single years ending on 29 February',
      { ...singleYears, yearType: 'specified-end-date', yearEndDay: 29, yearEndMonth: 2 },
    ],
    ['periods of more than 1 year', { ...multipleYears, multipleYearsYearType: 'financial' }],
    ['a date range crossing the new year', dateRange],
    [
      'years rolling on by the month',
      { ...singleYears, yearType: 'calendar', periodsRolling: true, rollingFrequency: 'months' },
    ],
  ] as const)('holds time periods of %s', async (_, values) => {
    await expect(
      addVersion(await newIndicatorId(), 'draft', values as never),
    ).resolves.toHaveLength(1);
  });

  // Each case names the check that refuses it; Postgres tries the checks in name order.
  it.each([
    ['a kind of time period the service does not know', { timePeriods: ['weeks'] }, 'time_periods'],
    ['no kinds of time period', { timePeriods: [] }, 'time_periods'],
    ['a year type the service does not know', { ...singleYears, yearType: 'survey' }, 'year_type'],
    ['a rolling year type', { ...singleYears, yearType: 'rolling' }, 'year_type'],
    [
      'a year type on months',
      { timePeriods: ['months'], yearType: 'calendar' },
      'year_type_period',
    ],
    ['no year type on single years', singleYears, 'year_type_period'],
    [
      'a year end on a calendar year',
      { ...singleYears, yearType: 'calendar', yearEndDay: 31, yearEndMonth: 7 },
      'year_end',
    ],
    [
      'no year end on a year ending on a date',
      { ...singleYears, yearType: 'specified-end-date' },
      'year_end',
    ],
    [
      'half a year end',
      { ...singleYears, yearType: 'specified-end-date', yearEndDay: 31 },
      'year_end',
    ],
    [
      '31 February',
      { ...singleYears, yearType: 'specified-end-date', yearEndDay: 31, yearEndMonth: 2 },
      'year_end_date',
    ],
    [
      'a number of years beside no periods of more than 1 year',
      { timePeriods: ['months'], multipleYearsCount: 3 },
      'multiple_years_count_period',
    ],
    [
      'periods of 1 year as more than 1 year',
      { ...multipleYears, multipleYearsCount: 1, multipleYearsYearType: 'calendar' },
      'multiple_years_count',
    ],
    [
      'no year type on periods of more than 1 year',
      multipleYears,
      'multiple_years_year_type_period',
    ],
    [
      'no year end on periods of more than 1 year ending on a date',
      { ...multipleYears, multipleYearsYearType: 'specified-end-date' },
      'multiple_years_end',
    ],
    [
      'half a date range',
      { timePeriods: ['date-range'], dateRangeStartDay: 1, dateRangeStartMonth: 9 },
      'date_range',
    ],
    ['a date range beside no date range', { ...dateRange, timePeriods: ['months'] }, 'date_range'],
    [
      'a date range ending 30 February',
      { ...dateRange, dateRangeEndDay: 30, dateRangeEndMonth: 2 },
      'date_range_end_date',
    ],
    [
      'a rolling frequency beside periods that do not roll',
      { periodsRolling: false, rollingFrequency: 'years' },
      'rolling_frequency_rolling',
    ],
    ['rolling periods with no frequency', { periodsRolling: true }, 'rolling_frequency_rolling'],
    [
      'a rolling frequency the service does not know',
      { periodsRolling: true, rollingFrequency: 'weeks' },
      'rolling_frequency',
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

  it.each([
    ['the standard method used', { standardMethodUsed: true }],
    ['the standard method not used', { standardMethodUsed: false, methodology: 'Our own' }],
    ['a methodology with no standard method question', { methodology: 'Scored' }],
  ] as const)('accepts %s', async (_, answers) => {
    await expect(addVersion(await newIndicatorId(), 'draft', answers)).resolves.toHaveLength(1);
  });

  it.each([
    ['a methodology beside the standard method', { standardMethodUsed: true, methodology: 'x' }],
    ['no methodology when the standard method was not used', { standardMethodUsed: false }],
  ] as const)('refuses %s', async (_, answers) => {
    await expect(addVersion(await newIndicatorId(), 'draft', answers)).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION, constraint_name: 'indicator_version_methodology_check' },
    });
  });

  it.each(['numerator', 'denominator'])(
    'refuses a %s disclosure control answer the publisher form does not offer',
    async (part) => {
      const [draft] = await addVersion(await newIndicatorId(), 'draft');

      await expect(
        db.execute(
          sql`UPDATE indicator_version SET ${sql.identifier(`${part}_disclosure_control`)} = 'no' WHERE id = ${draft?.id ?? ''}`,
        ),
      ).rejects.toMatchObject({
        cause: {
          code: CHECK_VIOLATION,
          constraint_name: `indicator_version_${part}_disclosure_control_check`,
        },
      });
    },
  );

  it.each([
    ['numerator disclosure control of nobody', { numeratorDisclosureControlDetail: 'Suppressed' }],
    [
      'numerator disclosure control that is not applicable',
      { numeratorDisclosureControl: 'not-applicable', numeratorDisclosureControlDetail: 'x' },
    ],
    [
      'denominator disclosure control that is not applicable',
      { denominatorDisclosureControl: 'not-applicable', denominatorDisclosureControlDetail: 'x' },
    ],
    ['caveats of nobody', { caveatsDetail: 'Survey data' }],
    ['caveats not needed', { hasCaveats: false, caveatsDetail: 'Survey data' }],
    ['other notes not needed', { hasOtherNotes: false, otherNotesDetail: 'Revised' }],
    ['exclusions of nobody', { exclusionsDetail: 'Small areas' }],
    ['no exclusions', { hasExclusions: false, exclusionsDetail: 'Small areas' }],
    ['automation of nobody', { automationDetail: 'Pipeline' }],
    [
      'no automation',
      { hasAutomation: false, automationDetail: 'Pipeline', noAutomationReason: 'Unsupported' },
    ],
    ['reviewer comments of nobody', { reviewerCommentsDetail: 'Replaces 108' }],
    [
      'no reviewer comments',
      { hasReviewerComments: false, reviewerCommentsDetail: 'Replaces 108' },
    ],
  ] as const)('refuses a detail beside %s', async (_, values) => {
    await expect(addVersion(await newIndicatorId(), 'draft', values)).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION },
    });
  });

  it('accepts a detail beside a yes', async () => {
    await expect(
      addVersion(await newIndicatorId(), 'draft', {
        numeratorDisclosureControl: 'yes',
        numeratorDisclosureControlDetail: 'Suppressed',
        denominatorDisclosureControl: 'yes',
        denominatorDisclosureControlDetail: 'Rounded',
        hasCaveats: true,
        caveatsDetail: 'Survey data',
        hasOtherNotes: true,
        otherNotesDetail: 'Revised',
        hasExclusions: true,
        exclusionsDetail: 'Small areas',
        hasAutomation: true,
        automationDetail: 'Pipeline',
        hasReviewerComments: true,
        reviewerCommentsDetail: 'Replaces 108',
        hasCiMethodModifications: true,
        ciMethodModificationsDetail: 'Adjusted for repeat admissions',
      }),
    ).resolves.toHaveLength(1);
  });

  it.each([
    ['an unanswered question', { noAutomationReason: 'Unsupported' }],
    [
      'a yes',
      { hasAutomation: true, automationDetail: 'Pipeline', noAutomationReason: 'Unsupported' },
    ],
  ] as const)('refuses reasons why no automation tools were used beside %s', async (_, values) => {
    await expect(addVersion(await newIndicatorId(), 'draft', values)).rejects.toMatchObject({
      cause: {
        code: CHECK_VIOLATION,
        constraint_name: 'indicator_version_no_automation_reason_check',
      },
    });
  });

  it('accepts the reasons beside a no to automation, and refuses a no without them', async () => {
    await expect(
      addVersion(await newIndicatorId(), 'draft', {
        hasAutomation: false,
        noAutomationReason: 'Unsupported',
      }),
    ).resolves.toHaveLength(1);
    await expect(
      addVersion(await newIndicatorId(), 'draft', { hasAutomation: false }),
    ).rejects.toMatchObject({
      cause: {
        code: CHECK_VIOLATION,
        constraint_name: 'indicator_version_no_automation_reason_check',
      },
    });
  });

  it.each([
    ['a numerator definition', { numeratorDefinition: 'Deaths' }],
    ['a numerator disclosure control answer', { numeratorDisclosureControl: 'not-applicable' }],
    ['a denominator definition', { denominatorDefinition: 'Population' }],
    ['a denominator disclosure control answer', { denominatorDisclosureControl: 'not-applicable' }],
  ] as const)('refuses %s beside no numerator and denominator', async (_, values) => {
    await expect(
      addVersion(await newIndicatorId(), 'draft', { hasNumeratorDenominator: false, ...values }),
    ).rejects.toMatchObject({
      cause: {
        code: CHECK_VIOLATION,
        constraint_name: 'indicator_version_numerator_denominator_check',
      },
    });
  });

  it('accepts a numerator and denominator beside a yes, and beside an unanswered question', async () => {
    const answers = { numeratorDefinition: 'Deaths', denominatorDefinition: 'Population' };

    await expect(
      addVersion(await newIndicatorId(), 'draft', { hasNumeratorDenominator: true, ...answers }),
    ).resolves.toHaveLength(1);
    await expect(addVersion(await newIndicatorId(), 'draft', answers)).resolves.toHaveLength(1);
  });

  it('refuses no caveats beside data quality issues, as the contract does', async () => {
    await expect(
      addVersion(await newIndicatorId(), 'draft', {
        hasDataQualityIssues: true,
        hasCaveats: false,
      }),
    ).rejects.toMatchObject({
      cause: {
        code: CHECK_VIOLATION,
        constraint_name: 'indicator_version_data_quality_caveats_check',
      },
    });
  });

  it.each([
    [
      'caveats beside data quality issues',
      { hasDataQualityIssues: true, hasCaveats: true, caveatsDetail: 'Survey data' },
    ],
    ['caveats not yet answered', { hasDataQualityIssues: true }],
    ['no data quality issues', { hasDataQualityIssues: false, hasCaveats: false }],
    ['a data quality answer not yet given', { hasCaveats: false }],
  ] as const)('accepts %s', async (_, values) => {
    await expect(addVersion(await newIndicatorId(), 'draft', values)).resolves.toHaveLength(1);
  });

  // The contract requires each of these details beside a yes, so the table does too.
  it.each([
    [
      'numerator disclosure control',
      { numeratorDisclosureControl: 'yes' },
      'numerator_disclosure_control_detail',
    ],
    [
      'denominator disclosure control',
      { denominatorDisclosureControl: 'yes' },
      'denominator_disclosure_control_detail',
    ],
    ['caveats', { hasCaveats: true }, 'caveats_detail'],
    ['other notes', { hasOtherNotes: true }, 'other_notes_detail'],
    ['exclusions', { hasExclusions: true }, 'exclusions_detail'],
    ['automation', { hasAutomation: true }, 'automation_detail'],
    ['reviewer comments', { hasReviewerComments: true }, 'reviewer_comments_detail'],
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
    position: 0,
    lowerComparison: 'less-than',
    lowerValue: 90,
    upperComparison: 'more-than-or-equal',
    upperValue: 95,
    polarity: 'higher-is-better',
    policyDetail: 'The national immunisation programme target.',
  } as const;

  /** Adds the goal to a new draft that answers yes. */
  async function addGoal(values: Partial<typeof indicatorVersionGoal.$inferInsert>) {
    const [draft] = await addVersion(await newIndicatorId(), 'draft', { hasGoalBenchmark: true });
    return db
      .insert(indicatorVersionGoal)
      .values({ ...goal, indicatorVersionId: draft?.id ?? '', ...values })
      .returning();
  }

  it.each([
    ['a goal', goal],
    [
      'a single goal value without detail',
      { upperValue: null, upperComparison: null, policyDetail: null },
    ],
    ['a negative goal', { lowerValue: -2.5, upperValue: -0.5 }],
    [
      'a low-is-good goal with strict comparisons',
      {
        lowerComparison: 'less-than-or-equal',
        upperComparison: 'more-than',
        polarity: 'lower-is-better',
      },
    ],
  ] as const)('accepts %s', async (_, values) => {
    await expect(addGoal(values)).resolves.toHaveLength(1);
  });

  // Each case names the check that refuses it; Postgres tries the checks in name order.
  it.each([
    ['a negative position', { position: -1 }, 'position'],
    ['an upper value without its comparison', { upperComparison: null }, 'upper_pair'],
    ['an upper comparison without its value', { upperValue: null }, 'upper_pair'],
    ['an upper value equal to the lower', { upperValue: 90 }, 'upper_value'],
    ['an upper value below the lower', { upperValue: 85 }, 'upper_value'],
    ['a lower value that is no number, beside an upper', { lowerValue: Number.NaN }, 'upper_value'],
    ['an infinite lower value', { lowerValue: Number.NEGATIVE_INFINITY }, 'values'],
    [
      'an infinite single value',
      { upperValue: null, upperComparison: null, lowerValue: Number.POSITIVE_INFINITY },
      'values',
    ],
    ['an infinite upper value', { upperValue: Number.POSITIVE_INFINITY }, 'values'],
    [
      'a single value that is no number',
      { upperValue: null, upperComparison: null, lowerValue: Number.NaN },
      'values',
    ],
    ['an upper value that is no number', { upperValue: Number.NaN }, 'values'],
  ] as const)('refuses %s', async (_, values, check) => {
    await expect(addGoal(values)).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION, constraint_name: `indicator_version_goal_${check}_check` },
    });
  });

  it.each([
    ['polarity', 'no-polarity'],
    ['polarity', 'high-is-good'],
    ['lower_comparison', 'more-than'],
    ['upper_comparison', 'less-than'],
  ])('refuses a goal %s of %s', async (column, value) => {
    const [row] = await addGoal({});

    await expect(
      db.execute(
        sql`UPDATE indicator_version_goal SET ${sql.identifier(column)} = ${value}
            WHERE indicator_version_id = ${row?.indicatorVersionId ?? ''}`,
      ),
    ).rejects.toMatchObject({
      cause: { code: CHECK_VIOLATION, constraint_name: `indicator_version_goal_${column}_check` },
    });
  });

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
      'indicator_version_data_value_version_fk',
      'indicator_version_goal_version_fk',
      'indicator_version_review_note_author_fk',
      'indicator_version_review_note_submission_fk',
      'indicator_version_source_data_value_fk',
      'indicator_version_source_provider_fk',
      'indicator_version_source_source_fk',
      'indicator_version_source_version_fk',
      'indicator_version_submission_ended_by_fk',
      'indicator_version_submission_flag_cleared_by_fk',
      'indicator_version_submission_flag_response_fk',
      'indicator_version_submission_response_core_team_member_fk',
      'indicator_version_submission_response_reviewer_fk',
      'indicator_version_submission_response_submission_fk',
      'indicator_version_submission_reviewer_assigned_by_fk',
      'indicator_version_submission_reviewer_reviewer_fk',
      'indicator_version_submission_reviewer_submission_fk',
      'indicator_version_submission_submitted_by_fk',
      'indicator_version_submission_update_decided_by_fk',
      'indicator_version_submission_version_fk',
      'indicator_version_subtopic_subtopic_fk',
      'indicator_version_subtopic_topic_fk',
      'indicator_version_topic_topic_fk',
      'indicator_version_topic_version_fk',
    ]);
  });
});

describe("a version's data values", () => {
  async function newProviderId(): Promise<string> {
    const [row] = await db
      .insert(dataProvider)
      .values({ name: `Schema test provider ${crypto.randomUUID()}` })
      .returning({ id: dataProvider.id });
    if (!row) throw new Error('inserted no provider');
    return row.id;
  }

  async function draftWithDataValue(): Promise<string> {
    const [version] = await addVersion(await newIndicatorId(), 'draft');
    if (!version) throw new Error('added no version');
    await db
      .insert(indicatorVersionDataValue)
      .values({ indicatorVersionId: version.id, position: 0, definition: 'Admissions' });
    return version.id;
  }

  it("holds a data value's sources beside it", async () => {
    const versionId = await draftWithDataValue();
    const providerId = await newProviderId();

    await expect(
      db.insert(indicatorVersionSource).values({
        indicatorVersionId: versionId,
        part: 'data-value',
        position: 0,
        providerId,
        dataValuePosition: 0,
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['a data value source that names no data value', 'data-value', null],
    ['a numerator source that names a data value', 'numerator', 0],
  ] as const)('refuses %s', async (_, part, dataValuePosition) => {
    const versionId = await draftWithDataValue();

    await expect(
      db.insert(indicatorVersionSource).values({
        indicatorVersionId: versionId,
        part,
        position: 0,
        providerId: await newProviderId(),
        dataValuePosition,
      }),
    ).rejects.toMatchObject({
      cause: {
        code: CHECK_VIOLATION,
        constraint_name: 'indicator_version_source_data_value_check',
      },
    });
  });

  it('refuses a source naming a data value the version does not have', async () => {
    const versionId = await draftWithDataValue();

    await expect(
      db.insert(indicatorVersionSource).values({
        indicatorVersionId: versionId,
        part: 'data-value',
        position: 0,
        providerId: await newProviderId(),
        dataValuePosition: 1,
      }),
    ).rejects.toMatchObject({
      cause: { constraint_name: 'indicator_version_source_data_value_fk' },
    });
  });

  it('refuses disclosure control details beside anything but a yes', async () => {
    const [version] = await addVersion(await newIndicatorId(), 'draft');

    await expect(
      db.insert(indicatorVersionDataValue).values({
        indicatorVersionId: version?.id ?? '',
        position: 0,
        disclosureControl: 'not-applicable',
        disclosureControlDetail: 'Suppressed',
      }),
    ).rejects.toMatchObject({
      cause: {
        code: CHECK_VIOLATION,
        constraint_name: 'indicator_version_data_value_disclosure_control_detail_check',
      },
    });
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

  it('show the update frequency with its reason, which is null when none was given', async () => {
    const withReason = await newIndicatorId();
    const withoutReason = await newIndicatorId();
    await addVersion(withReason, 'published', {
      updateFrequency: 'no-longer-updated',
      updateFrequencyReason: 'The survey has ended.',
    });
    await addVersion(withoutReason, 'published', { updateFrequency: 'no-fixed-frequency' });

    const rows = (await db.execute(
      sql`SELECT id, update_frequency, update_frequency_reason FROM published.indicator
          WHERE id IN (${withReason}, ${withoutReason})`,
    )) as unknown as {
      id: string;
      update_frequency: string;
      update_frequency_reason: string | null;
    }[];

    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({
      id: withReason,
      update_frequency: 'no-longer-updated',
      update_frequency_reason: 'The survey has ended.',
    });
    expect(rows).toContainEqual({
      id: withoutReason,
      update_frequency: 'no-fixed-frequency',
      update_frequency_reason: null,
    });
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

  it('keep the notes and caveats answers off the public surface', async () => {
    const rows = (await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'published' AND table_name = 'indicator'
            AND column_name ~ '(disclosure_control|caveats|other_notes)'
          ORDER BY ordinal_position`,
    )) as unknown as { column_name: string }[];

    expect(rows.map((row) => row.column_name)).toEqual([
      'numerator_disclosure_control_detail',
      'denominator_disclosure_control_detail',
      'caveats_detail',
      'other_notes_detail',
    ]);
  });

  it('keep the notes for reviewers off the public surface', async () => {
    const rows = (await db.execute(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'published'
            AND column_name IN (
              'variation', 'quality_assurance', 'source_data_issues_detail',
              'ci_method_justification', 'data_sources_justification', 'inequalities_included',
              'has_exclusions', 'exclusions_detail', 'has_automation', 'automation_detail',
              'no_automation_reason', 'sponsors_and_stakeholders', 'has_reviewer_comments',
              'reviewer_comments_detail', 'update_summary_for_reviewers'
            )`,
    )) as unknown as { column_name: string }[];

    expect(rows).toEqual([]);
  });

  it('keep the reason for fast-tracking off the public surface', async () => {
    const rows = (await db.execute(
      sql`SELECT table_name FROM information_schema.columns
          WHERE table_schema = 'published' AND column_name = 'fast_track_reason'`,
    )) as unknown as { table_name: string }[];

    expect(rows).toEqual([]);
  });

  it('keep the PHOF indicator number off the public surface', async () => {
    const rows = (await db.execute(
      sql`SELECT table_name FROM information_schema.columns
          WHERE table_schema = 'published' AND column_name = 'phof_indicator_number'`,
    )) as unknown as { table_name: string }[];

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
