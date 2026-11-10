import type { IndicatorSearchFilters, Repositories } from '@fphd/db';
import { CONTROL_CHARACTER } from '@fphd/utils/control-character';
import { indicatorSort } from '@fphd/utils/indicator-sort';
import { isShortId, SHORT_ID_PATTERN } from '@fphd/utils/short-id';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@fphd/utils/slug';
import { Router } from 'express';

import type {
  IndicatorAreaData,
  IndicatorDetail,
  IndicatorFacets,
  IndicatorSearchResult,
} from './contract.ts';
import {
  DEFAULT_INDICATOR_SEARCH_RESULTS,
  indicatorPeriodFiltersSchema,
  MAX_AREA_NAME_LENGTH,
  MAX_AREA_PREVIEW,
  MAX_FILTER_LABEL_LENGTH,
  MAX_FILTER_VALUE_LENGTH,
  MAX_FILTER_VALUES,
  MAX_INDICATOR_FILTER_RESULTS,
  MAX_INDICATOR_QUERY_LENGTH,
  MAX_INDICATOR_SEARCH_RESULTS,
  MAX_RANKING_AREAS,
  MAX_SELECTED_AREAS,
  MAX_TABLE_INDICATORS_PER_REQUEST,
  pickAreaCodes,
  queryText,
} from './contract.ts';

const DEFAULT_AREA_CODE = 'E92000001';

/**
 * An indicator is addressed by short id or by slug, and both answer 200: a client that
 * kept an old address is served, not redirected. Anything shaped like neither is a probe
 * or a typo, and undefined here makes it indistinguishable from an unknown indicator.
 */
async function resolveIndicator(
  indicators: Repositories['indicators'],
  segment: string,
): Promise<string | undefined> {
  // A slug is never digits only, so a digit run addresses a short id or nothing.
  if (SHORT_ID_PATTERN.test(segment)) {
    return isShortId(segment) ? indicators.resolveId(Number(segment)) : undefined;
  }

  const slug = segment.toLowerCase();

  return SLUG_PATTERN.test(slug) && slug.length <= SLUG_MAX_LENGTH
    ? indicators.resolveIdBySlug(slug)
    : undefined;
}

function pickStrings(value: unknown, maxLength = MAX_FILTER_VALUE_LENGTH): string[] {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [value]).filter(
        (entry): entry is string =>
          typeof entry === 'string' &&
          entry !== '' &&
          entry.length <= maxLength &&
          !CONTROL_CHARACTER.test(entry),
      ),
    ),
  ].slice(0, MAX_FILTER_VALUES);
}

export function indicatorsRouter(indicators: Repositories['indicators']): Router {
  const router = Router();

  router.get('/api/indicators/:indicator/ranking', async (request, response) => {
    const areaCodes = pickAreaCodes(request.query.areaCode, MAX_RANKING_AREAS);
    const indicatorId = areaCodes.length
      ? await resolveIndicator(indicators, request.params.indicator)
      : undefined;
    if (!indicatorId) {
      response.status(404).json({ error: 'not_found' });
      return;
    }
    const data: IndicatorAreaData[] = await indicators.findRankingData(indicatorId, areaCodes);
    response.status(data.length ? 200 : 404).json(data.length ? data : { error: 'not_found' });
  });

  router.get('/api/indicator-data', async (request, response) => {
    const raw = request.query.indicator;
    const shortIds = [
      ...new Set(
        (Array.isArray(raw) ? raw : [raw])
          .filter((value): value is string => typeof value === 'string' && isShortId(value))
          .map(Number),
      ),
    ].slice(0, MAX_TABLE_INDICATORS_PER_REQUEST);
    const areaCodes = pickAreaCodes(request.query.areaCode ?? DEFAULT_AREA_CODE);
    if (!shortIds.length || !areaCodes.length) {
      response.status(404).json({ error: 'not_found' });
      return;
    }
    const entries =
      request.query.points === 'latest'
        ? await indicators.findTableData(shortIds, areaCodes, 'latest')
        : request.query.points === 'sparkline'
          ? await indicators.findTableData(shortIds, areaCodes, 'sparkline')
          : await indicators.findTableData(shortIds, areaCodes);
    if (entries.length !== shortIds.length || entries.some(({ areaData }) => !areaData.length)) {
      response.status(404).json({ error: 'not_found' });
      return;
    }
    response.status(200).json(entries);
  });

  router.get('/api/indicators/facets', async (_request, response) => {
    const facets: IndicatorFacets = await indicators.listFacets();
    response.status(200).json(facets);
  });

  router.get('/api/indicators/search', async (request, response) => {
    const { q } = request.query;
    const query = queryText(q, MAX_INDICATOR_QUERY_LENGTH);

    const filters: IndicatorSearchFilters = {
      query,
      topics: pickStrings(request.query.t),
      ...(request.query.subtopic ? { subtopics: pickStrings(request.query.subtopic) } : {}),
      indicatorTypes: pickStrings(request.query.it),
      lifeStages: pickStrings(request.query.ls),
      frameworks: pickStrings(request.query.fw),
      populations: pickStrings(request.query.pg),
      inequalities: pickStrings(request.query.eq),
      displayGroups: pickStrings(request.query.displayGroup),
      areaCodes: pickAreaCodes(request.query.areaCode, MAX_SELECTED_AREAS),
      sources: pickStrings(request.query.src, MAX_FILTER_LABEL_LENGTH),
      valueTypes: pickStrings(request.query.vt),
      yearTypes: pickStrings(request.query.per),
      limit: MAX_INDICATOR_FILTER_RESULTS,
    };
    const { page, sort } = request.query;
    const { fromYear, toYear, updatedWithin } = indicatorPeriodFiltersSchema.parse(request.query);
    if (typeof page === 'string') {
      const requested = Number(page);
      filters.page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
      const limit = request.query.limit;
      filters.limit =
        typeof limit === 'string' && /^[1-9]\d*$/.test(limit)
          ? Math.min(Number(limit), MAX_INDICATOR_FILTER_RESULTS)
          : 10;
    }
    const requestedSort = indicatorSort(sort);
    if (requestedSort?.startsWith('trend-') && filters.topics.length !== 1) {
      response.status(400).json({ error: 'topic_required_for_trend_sort' });
      return;
    }
    if (requestedSort) filters.sort = requestedSort;
    if (fromYear) filters.dataFromYear = Number(fromYear);
    if (toYear) filters.dataToYear = Number(toYear);
    if (updatedWithin) filters.updatedWithinMonths = Number(updatedWithin);

    const result: IndicatorSearchResult = await indicators.searchWithFilters(filters);
    response.status(200).json(result);
  });

  router.get('/api/indicators', async (request, response) => {
    const { q, limit } = request.query;
    const query = queryText(q, MAX_INDICATOR_QUERY_LENGTH);
    if (query) {
      const capped =
        typeof limit === 'string' && /^[1-9]\d*$/.test(limit)
          ? Math.min(Number(limit), MAX_INDICATOR_SEARCH_RESULTS)
          : DEFAULT_INDICATOR_SEARCH_RESULTS;
      response.status(200).json({ indicators: await indicators.search(query, capped) });
      return;
    }
    response.status(200).json({ indicators: await indicators.listPublished() });
  });

  router.get('/api/indicators/:indicator/areas', async (request, response) => {
    const indicatorId = await resolveIndicator(indicators, request.params.indicator);
    if (!indicatorId) {
      response.status(404).json({ error: 'not_found' });
      return;
    }
    const { displayGroup, q, limit, scope } = request.query;
    if (limit !== undefined && (typeof limit !== 'string' || !/^[1-9]\d*$/.test(limit))) {
      response.status(400).json({ error: 'invalid_limit' });
      return;
    }
    const query = queryText(q, MAX_AREA_NAME_LENGTH);
    // A group holding a control character names none, so it has no areas, like any unknown group.
    if (typeof displayGroup === 'string' && CONTROL_CHARACTER.test(displayGroup)) {
      response.status(200).json([]);
      return;
    }
    response.status(200).json(
      await indicators.listAreas(indicatorId, {
        scope: scope === 'all-data' ? 'all-data' : undefined,
        displayGroup:
          typeof displayGroup === 'string'
            ? displayGroup.slice(0, MAX_AREA_NAME_LENGTH)
            : undefined,
        query,
        limit:
          typeof limit === 'string' && /^[1-9]\d*$/.test(limit)
            ? Math.min(Number(limit), MAX_AREA_PREVIEW)
            : (typeof displayGroup === 'string' && displayGroup) || scope === 'all-data'
              ? undefined
              : MAX_AREA_PREVIEW,
      }),
    );
  });

  router.get('/api/indicators/:indicator/data', async (request, response) => {
    // Repeatable, so a page comparing many areas asks once rather than once per area.
    const requested = request.query.areaCode ?? DEFAULT_AREA_CODE;
    const areaCodes = pickAreaCodes(requested);

    if (areaCodes.length === 0) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    const indicatorId = await resolveIndicator(indicators, request.params.indicator);
    if (!indicatorId) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    const data: IndicatorAreaData[] = await indicators.findObservationsForAreas(
      indicatorId,
      areaCodes,
    );

    // The indicator is known, so every requested area missing means unknown areas.
    if (data.length === 0) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    // A single area answers with the bare object it always has; several answer with a list.
    response.status(200).json(areaCodes.length === 1 ? data[0] : data);
  });

  router.get('/api/indicators/:indicator/range', async (request, response) => {
    const displayGroup = request.query.displayGroup;

    if (
      typeof displayGroup !== 'string' ||
      displayGroup === '' ||
      displayGroup.length > 100 ||
      CONTROL_CHARACTER.test(displayGroup)
    ) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    const indicatorId = await resolveIndicator(indicators, request.params.indicator);
    if (!indicatorId) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    // An indicator with no data at this level answers with an empty range rather than an
    // error, matching how /api/areas treats unknown groups.
    response.status(200).json({
      periods: await indicators.findObservationRange(indicatorId, displayGroup),
    });
  });

  router.get('/api/indicators/:indicator', async (request, response) => {
    const indicatorId = await resolveIndicator(indicators, request.params.indicator);
    if (!indicatorId) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    // The annotation binds the repository's shape to the wire contract at compile time.
    const detail: IndicatorDetail | undefined = await indicators.findPublishedById(indicatorId);

    if (!detail) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    response.status(200).json(detail);
  });

  return router;
}
