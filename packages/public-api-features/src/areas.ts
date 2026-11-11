import type { Repositories } from '@fphd/db';
import { CONTROL_CHARACTER } from '@fphd/utils/control-character';
import { Router } from 'express';
import {
  DEFAULT_AREA_SEARCH_RESULTS,
  MAX_AREA_GROUPS_PER_REQUEST,
  MAX_AREA_NAME_LENGTH,
  MAX_AREA_PREVIEW,
  MAX_AREA_SEARCH_RESULTS,
  pickAreaCodes,
  queryLimit,
  queryText,
} from './contract.ts';

export function areasRouter(areas: Repositories['areas']): Router {
  const router = Router();

  router.get('/api/areas/display-groups', async (_request, response) => {
    response.status(200).json(await areas.listDisplayGroups());
  });

  router.get('/api/areas/lookup', async (request, response) => {
    const codes = pickAreaCodes(request.query.areaCode);

    if (codes.length === 0) {
      response.status(400).json({ error: 'area_code_required' });
      return;
    }

    response.status(200).json(await areas.listByCodes(codes));
  });

  router.get('/api/areas/search', async (request, response) => {
    const { q, limit } = request.query;
    const query = queryText(q, MAX_AREA_NAME_LENGTH);

    if (!query) {
      response.status(400).json({ error: 'q_required' });
      return;
    }

    const capped = queryLimit(limit, MAX_AREA_SEARCH_RESULTS) ?? DEFAULT_AREA_SEARCH_RESULTS;
    response.status(200).json(await areas.search(query, capped));
  });

  router.get('/api/areas/parents', async (request, response) => {
    const codes = pickAreaCodes(request.query.areaCode);
    const parentType = request.query.parentType;

    if (
      codes.length === 0 ||
      typeof parentType !== 'string' ||
      parentType === '' ||
      parentType.length > MAX_AREA_NAME_LENGTH ||
      CONTROL_CHARACTER.test(parentType)
    ) {
      response.status(400).json({ error: 'area_code_and_parent_type_required' });
      return;
    }

    // Areas without a parent of the requested type are simply absent from the answer.
    response.status(200).json(await areas.listParents(codes, parentType));
  });

  router.get('/api/areas', async (request, response) => {
    // De-duplicate and cap names before querying or expanding groups.
    const pick = (value: unknown) =>
      [
        ...new Set(
          (Array.isArray(value) ? value : [value]).filter(
            (entry): entry is string =>
              typeof entry === 'string' &&
              entry !== '' &&
              entry.length <= MAX_AREA_NAME_LENGTH &&
              !CONTROL_CHARACTER.test(entry),
          ),
        ),
      ].slice(0, MAX_AREA_GROUPS_PER_REQUEST);
    const areaTypeNames = pick(request.query.areaType);
    const displayGroups = pick(request.query.displayGroup);
    const limit = queryLimit(request.query.limit, MAX_AREA_PREVIEW);

    if (areaTypeNames.length === 0 && displayGroups.length === 0) {
      response.status(400).json({ error: 'area_type_or_display_group_required' });
      return;
    }

    // An unknown type or group is an empty group, not an error — the caller cannot know
    // which exist without asking. Asking by repeated parameter always answers with groups,
    // so a caller's parsing does not change with how many it happened to ask for.
    const groups = await Promise.all([
      ...areaTypeNames.map(async (name) => ({
        areaType: name,
        areas: await areas.listByType(name),
      })),
      ...(displayGroups.length > 0 ? await areas.listByGroups(displayGroups, limit) : []),
    ]);

    response.status(200).json(groups);
  });

  return router;
}
