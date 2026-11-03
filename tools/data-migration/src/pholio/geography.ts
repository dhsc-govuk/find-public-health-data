import type { PholioExportOptions } from './context.ts';
import { areaId, areaRelationshipId } from './ids.ts';
import { queryPholio } from './source.ts';
import { TableWriter } from './table-writer.ts';

export function areaTypeName(rawName: string, areaTypeId: number, isDuplicate: boolean): string {
  return isDuplicate ? `${rawName} [${areaTypeId}]` : rawName;
}

/**
 * Normalise an area-type name for duplicate detection, matching SQL Server's
 * default collation (SQL_Latin1_General_CP1_CI_AS): trailing spaces are ignored
 * and comparison is case-insensitive.
 */
export function normalizeAreaTypeName(n: string): string {
  return n.trimEnd().toLowerCase();
}

export function areaTypeHierarchyType(areaTypeClass: string | null, areaTypeId: number): string {
  const nhsIds = new Set([7, 66, 153, 154, 165, 166, 204, 221, 223]);
  if (nhsIds.has(areaTypeId)) return 'NHS';
  if (!areaTypeClass) return 'Administrative';
  if (/NHS|CCG|ICB/i.test(areaTypeClass)) return 'NHS';
  return 'Administrative';
}

/** Exports area_type, area and area_relationship from Pholio. */
export async function exportGeography(context: PholioExportOptions) {
  const { pool, outDir } = context;
  const areaIdByPholioCode = new Map<string, number>();

  const areaTypeWriter = new TableWriter(outDir, 'area_type');
  const areaWriter = new TableWriter(outDir, 'area');
  const areaRelWriter = new TableWriter(outDir, 'area_relationship');

  // area_type: deduplicate names, assign hierarchy_type and level from Pholio
  const areaTypeRows = await queryPholio<{
    AreaTypeID: number;
    AreaType: string;
    AreaTypeClass: string | null;
    Sequence: number | null;
  }>(pool, 'SELECT AreaTypeID, AreaType, AreaTypeClass, Sequence FROM L_AreaTypes');

  // Find which names appear more than once, matching SQL Server collation:
  // trailing spaces and case differences are ignored.
  const nameCounts = new Map<string, number>();
  for (const r of areaTypeRows) {
    const key = normalizeAreaTypeName(r.AreaType);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }

  await areaTypeWriter.writeAll(
    areaTypeRows.map((r) => ({
      id: r.AreaTypeID,
      name: areaTypeName(
        r.AreaType,
        r.AreaTypeID,
        (nameCounts.get(normalizeAreaTypeName(r.AreaType)) ?? 1) > 1,
      ),
      hierarchy_type: areaTypeHierarchyType(r.AreaTypeClass, r.AreaTypeID),
      level: r.Sequence ?? 0,
    })),
  );

  const areaRows = await queryPholio<{
    AreaCode: string;
    AreaName: string | null;
    AreaTypeID: number;
    IsCurrent: boolean;
  }>(pool, 'SELECT AreaCode, AreaName, AreaTypeID, IsCurrent FROM L_Areas');

  // id collision detection for areaId (SHA-based hash)
  const idToCode = new Map<number, string>();

  const areaExportRows: Array<{
    id: number;
    code: string;
    name: string;
    area_type_id: number;
    valid_from: null;
    valid_to: null;
    is_current: boolean;
  }> = [];

  for (const r of areaRows) {
    const id = areaId(r.AreaCode);
    const existing = idToCode.get(id);
    if (existing !== undefined && existing !== r.AreaCode) {
      throw new Error(
        `areaId hash collision: AreaCode ${r.AreaCode} and ${existing} both map to id ${id}`,
      );
    }
    idToCode.set(id, r.AreaCode);

    // Map original Pholio AreaCode → exported id (used by observations stage for CoreDataSet.AreaCode lookup)
    areaIdByPholioCode.set(r.AreaCode, id);

    areaExportRows.push({
      id,
      code: r.AreaCode,
      name: r.AreaName ?? r.AreaCode,
      area_type_id: r.AreaTypeID,
      valid_from: null,
      valid_to: null,
      is_current: r.IsCurrent,
    });
  }

  await areaWriter.writeAll(areaExportRows);

  const mappingRows = await queryPholio<{
    ChildLevelGeographyCode: string;
    ParentLevelGeographyCode: string;
  }>(pool, 'SELECT DISTINCT ChildLevelGeographyCode, ParentLevelGeographyCode FROM L_AreaMapping');

  // id collision detection for relationships
  const relIdToKey = new Map<number, string>();
  const relExportRows: Array<{
    id: number;
    parent_area_id: number;
    child_area_id: number;
    valid_from: null;
    valid_to: null;
  }> = [];
  const seenRels = new Set<string>();

  for (const r of mappingRows) {
    const parentId = areaIdByPholioCode.get(r.ParentLevelGeographyCode);
    const childId = areaIdByPholioCode.get(r.ChildLevelGeographyCode);
    // Skip relationships where either end was not exported (e.g. codes not in L_Areas)
    if (parentId === undefined || childId === undefined) continue;

    const relKey = `${parentId}\u0000${childId}`;
    if (seenRels.has(relKey)) continue;
    seenRels.add(relKey);

    const parentCode = idToCode.get(parentId);
    const childCode = idToCode.get(childId);
    if (parentCode === undefined || childCode === undefined)
      throw new Error('Relationship references an unrecorded area identity');
    const id = areaRelationshipId(parentCode, childCode);
    const existingKey = relIdToKey.get(id);
    if (existingKey !== undefined && existingKey !== relKey) {
      throw new Error(
        `areaRelationshipId hash collision: ${r.ParentLevelGeographyCode}→${r.ChildLevelGeographyCode} and existing ${existingKey} both map to ${id}`,
      );
    }
    relIdToKey.set(id, relKey);

    relExportRows.push({
      id,
      parent_area_id: parentId,
      child_area_id: childId,
      valid_from: null,
      valid_to: null,
    });
  }

  await areaRelWriter.writeAll(relExportRows);

  return {
    areaIdByPholioCode,
    tables: {
      area_type: await areaTypeWriter.close(),
      area: await areaWriter.close(),
      area_relationship: await areaRelWriter.close(),
    },
  };
}
