import type postgres from 'postgres';

/**
 * A draft with an uploaded data table, which the seed doesn't have: every current area for 8
 * years, for Female and Male, stored as an upload would store them. Its dates are old, so the
 * dashboard lists it last while the routes are measured. It is deleted afterwards.
 */
export const DATA_TABLE_DRAFT = {
  indicatorId: '01a00000-0000-7000-8000-0000000f4040',
  versionId: '01a00000-0000-7000-8000-0000000f4041',
  batchId: '01a00000-0000-7000-8000-0000000f4042',
  /** The seed's 6,544 current areas, 8 years, 2 sexes; the fixture refuses to load otherwise. */
  rowCount: 104_704,
};

const YEARS = 8;
// Sam Taylor, the publisher the routes are requested as (FAKE_USER_IDS in @fphd/auth).
const PUBLISHER = '01a13c69-96ab-7598-9ce0-f84dbec3d5dd';

/** Creates the draft, replacing any left behind by an interrupted run. */
export async function createDataTableDraft(sql: postgres.Sql): Promise<void> {
  const { indicatorId, versionId, batchId, rowCount } = DATA_TABLE_DRAFT;
  await deleteDataTableDraft(sql);

  await sql.begin(async (tx) => {
    // Team A, Sam Taylor's, so the publisher the routes are requested as may edit it.
    await tx`
      insert into indicator (id, created_at, team_id)
      values (${indicatorId}, '2000-01-01', '01a13c69-96aa-70af-81f9-10856a4023b2')`;
    await tx`
      insert into indicator_version
        (id, indicator_id, name, slug, created_at, updated_at, created_by, updated_by)
      values (${versionId}, ${indicatorId}, 'Route budget data table', 'route-budget-data-table',
        '2000-01-01', '2000-01-01', ${PUBLISHER}, ${PUBLISHER})`;
    await tx`
      insert into upload_batch
        (id, indicator_id, indicator_version_id, original_filename, uploaded_by, uploaded_at,
         status, row_count, column_names)
      values (${batchId}, ${indicatorId}, ${versionId}, 'data.csv', ${PUBLISHER}, '2000-01-01',
        'processed', ${rowCount}, ${['area_code', 'period_start', 'period_end', 'value', 'sex']})`;
    const loaded = await tx`
      with sex as (
        select dv.id, dv.dimension_type_id
        from dimension_value dv
        join dimension_type dt on dt.id = dv.dimension_type_id
        where dt.name = 'Sex' and dv.name in ('Female', 'Male')
      ),
      inserted as (
        insert into observation (
          id, indicator_id, area_id, from_date, to_date, value, upload_batch_id, dimension_key
        )
        select uuidv7(), ${indicatorId}, a.id, make_date(2015 + y, 1, 1),
          make_date(2015 + y, 12, 31),
          (row_number() over (order by a.code, y, sex.id) % 1000) / 10.0,
          ${batchId}, lower(sex.id::text)
        from area a
        cross join generate_series(1, ${YEARS}) y
        cross join sex
        where a.is_current = true
        returning id, dimension_key
      )
      insert into observation_dimension (observation_id, dimension_value_id, dimension_type_id)
      select inserted.id, sex.id, sex.dimension_type_id
      from inserted
      join sex on lower(sex.id::text) = inserted.dimension_key`;
    if (loaded.count !== rowCount) {
      throw new Error(`The data table fixture made ${loaded.count} rows, not ${rowCount}`);
    }
    await tx`
      update indicator_version set upload_batch_id = ${batchId} where id = ${versionId}`;
  });
}

/** Removes the draft and its rows, so a local run leaves the database as the seed made it. */
export async function deleteDataTableDraft(sql: postgres.Sql): Promise<void> {
  const { indicatorId, versionId, batchId } = DATA_TABLE_DRAFT;
  await sql.begin(async (tx) => {
    await tx`update indicator_version set upload_batch_id = null where id = ${versionId}`;
    await tx`delete from observation where upload_batch_id = ${batchId}`;
    await tx`delete from upload_batch where id = ${batchId}`;
    await tx`delete from indicator_version where id = ${versionId}`;
    await tx`delete from indicator where id = ${indicatorId}`;
  });
}
