import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { schema } from './index.ts';
import { getIndicatorDetailById } from './indicator-repository.ts';
import { publishedViews } from './schema/published.ts';
import { apiLogin, createTestDb } from './testing.ts';

const testDb = await createTestDb({ template: 'seeded' });
const publicDb = testDb.connectDb({ login: apiLogin('public_api') });
afterAll(() => testDb.drop());

it('reads published grouping tuples through the public view without deriving choices from observations', async () => {
  const [indicator] = await testDb.db
    .select()
    .from(schema.indicator)
    .where(eq(schema.indicator.shortId, 108));
  if (!indicator) throw new Error('Seed indicator missing');
  const [age] = await testDb.db
    .select()
    .from(schema.dimensionValue)
    .where(eq(schema.dimensionValue.name, '65+ yrs'));
  const [sex] = await testDb.db
    .select()
    .from(schema.dimensionValue)
    .where(eq(schema.dimensionValue.name, 'Female'));
  if (!age || !sex) throw new Error('Core dimensions missing');
  await testDb.db.insert(schema.indicatorGrouping).values({
    indicatorId: indicator.id,
    ageId: age.id,
    sexId: sex.id,
    yearRange: 3,
    periodKind: 'annual',
  });
  const detail = await getIndicatorDetailById(publicDb, publishedViews, indicator.id);
  expect(detail?.publishedGroupings).toEqual([
    { sex: 'Female', age: '65+ yrs', yearRange: 3, periodKind: 'annual' },
    { sex: null, age: '<75 yrs', yearRange: 1, periodKind: 'annual' },
    { sex: null, age: '<75 yrs', yearRange: 3, periodKind: 'annual' },
  ]);
});

it('keeps unpublished indicators out of the grouping view', async () => {
  const [owner] = await testDb.db
    .select({ teamId: schema.indicator.teamId })
    .from(schema.indicator)
    .limit(1);
  if (!owner) throw new Error('Seed owner missing');
  const [indicator] = await testDb.db
    .insert(schema.indicator)
    .values({ teamId: owner.teamId })
    .returning();
  if (!indicator) throw new Error('Indicator missing');
  await testDb.db
    .insert(schema.indicatorGrouping)
    .values({ indicatorId: indicator.id, yearRange: 1, periodKind: 'annual' });
  expect(
    await publicDb
      .select()
      .from(publishedViews.indicatorGrouping)
      .where(eq(publishedViews.indicatorGrouping.indicatorId, indicator.id)),
  ).toEqual([]);
});
