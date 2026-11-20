import { z } from '@fphd/config/zod';
import { type AreaRow, ENGLAND_CODE, type Repositories } from '@fphd/db';
import { SLUG_PATTERN } from '@fphd/utils/slug';
import { Router } from 'express';

import {
  listItems,
  listParam,
  negotiate,
  notModified,
  parseQuery,
  sendInvalid,
  sendProblem,
  sendTable,
} from './http.ts';

export interface AreaRef {
  code: string;
  name: string;
  type: string;
  validFrom: string | null;
  validTo: string | null;
}

export const AREA_COLUMNS = ['code', 'name', 'type', 'validFrom', 'validTo'] as const;
export const AREA_TYPE_COLUMNS = ['slug', 'name', 'hierarchy', 'parentTypes'] as const;

// GSS and NHS codes are letters and digits, but Fingertips gives some areas, such as laboratories
// and area classification groups, codes with other characters URLs leave unencoded.
export const AREA_CODE_PATTERN = /^[A-Za-z0-9._~-]{1,100}$/;
const PARTIAL_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/** The first day of a year, month or day, written as ISO 8601 at any of those precisions. */
export function startOf(partialDate: string): string {
  const [year, month = '01', day = '01'] = partialDate.split('-');
  return `${year}-${month}-${day}`;
}

/** Today in UTC, as the date boundaries are taken at when none is asked for. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function toAreaRef({ code, name, level, validFrom, validTo }: AreaRow): AreaRef {
  return { code, name, type: level, validFrom, validTo };
}

export const areaQuery = {
  area: listParam(AREA_CODE_PATTERN, 'area codes'),
  areaType: z.string().regex(SLUG_PATTERN, 'must be an area type slug').optional(),
  parent: z.string().regex(AREA_CODE_PATTERN, 'must be an area code').optional(),
  boundaries: z.string().regex(PARTIAL_DATE, 'must be a date such as 2021 or 2021-04').optional(),
};

export function areasRouter(
  areas: Repositories['areas'],
  reference: Repositories['reference'],
): Router {
  const router = Router();

  router.get('/v0/area-types', async (request, response) => {
    if (parseQuery(request, response, {}) === undefined) return;
    const format = negotiate(request, response, ['csv', 'json']);
    if (format === undefined) return;
    if (notModified(request, response, await reference.dataVersion(), format)) return;

    const levels = await areas.listLevels();
    sendTable(
      response,
      format,
      AREA_TYPE_COLUMNS,
      levels.map(({ slug, name, hierarchy, parentLevels }) => ({
        slug,
        name,
        hierarchy,
        parentTypes: parentLevels,
      })),
    );
  });

  router.get('/v0/areas', async (request, response) => {
    const query = parseQuery(request, response, {
      ...areaQuery,
      name: z.string().min(2).max(100).optional(),
    });
    if (query === undefined) return;
    if (query.area !== undefined && query.areaType !== undefined) {
      sendInvalid(response, [{ name: 'areaType', reason: 'cannot be used with area' }]);
      return;
    }
    if (query.boundaries !== undefined && query.areaType === undefined) {
      sendInvalid(response, [{ name: 'boundaries', reason: 'needs areaType' }]);
      return;
    }
    const format = negotiate(request, response, ['csv', 'json']);
    if (format === undefined) return;

    if (query.areaType !== undefined) {
      const levels = await areas.listLevels();
      if (!levels.some(({ slug }) => slug === query.areaType)) {
        sendInvalid(response, [{ name: 'areaType', reason: 'no area type has that slug' }]);
        return;
      }
    }
    if (notModified(request, response, await reference.dataVersion(), format)) return;

    const codes = listItems(query.area);
    const rows = await areas.find({
      ...(codes === undefined ? {} : { codes }),
      ...(query.areaType === undefined ? {} : { level: query.areaType }),
      ...(query.parent === undefined ? {} : { parent: query.parent }),
      ...(query.name === undefined ? {} : { name: query.name }),
      // Codes name areas whatever their boundaries. Otherwise, areas as they stand.
      ...(codes === undefined ? { on: startOf(query.boundaries ?? today()) } : {}),
    });

    sendTable(response, format, AREA_COLUMNS, rows.map(toAreaRef));
  });

  router.get('/v0/areas/:code', async (request, response) => {
    if (parseQuery(request, response, {}) === undefined) return;
    const format = negotiate(request, response, ['json']);
    if (format === undefined) return;
    if (notModified(request, response, await reference.dataVersion(), format)) return;

    const { code } = request.params;
    const [area] = AREA_CODE_PATTERN.test(code) ? await areas.find({ codes: [code] }) : [];
    if (!area) {
      sendProblem(response, 404, 'not_found', `No area has the code '${code}'.`);
      return;
    }

    // The parents are the areas of the levels above this one, in the order its level gives them.
    const parentLevels =
      (await areas.listLevels()).find(({ slug }) => slug === area.level)?.parentLevels ?? [];
    const ancestors = (await areas.listAncestors(area.code)).map(toAreaRef);
    // Every English area is in England, though not every one is linked to it.
    if (parentLevels.includes('england') && !ancestors.some((p) => p.code === ENGLAND_CODE)) {
      const [england] = await areas.find({ codes: [ENGLAND_CODE] });
      if (england) ancestors.push(toAreaRef(england));
    }
    const parents = parentLevels.flatMap((level) => ancestors.filter((p) => p.type === level));

    response.json({
      ...toAreaRef(area),
      parents,
      // No neighbour model is loaded yet.
      statisticalNeighbours: { model: null, areas: [] },
    });
  });

  return router;
}
