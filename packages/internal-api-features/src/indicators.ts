import {
  requireApiActor,
  requireApiSession,
  requireJwtRole,
  requireJwtSession,
} from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import {
  canCreateIndicatorInTeam,
  canListIndicators,
  canSeeIndicator,
  type IndicatorAccess,
  indicatorListScope,
  ownTeamsListScope,
  type SessionUser,
} from '@fphd/auth/permissions';
import { Router } from 'express';

import {
  editVersionedSchema,
  type IndicatorAdminDetail,
  type IndicatorAdminListItem,
  type IndicatorAdminPage,
  type IndicatorAdminSummary,
  type IndicatorTaskList,
  indicatorFieldSchema,
  indicatorIdSchema,
  indicatorListTeamsQuerySchema,
  indicatorNameSchema,
  indicatorPageQuerySchema,
  indicatorTeamSchema,
  toFieldErrors,
} from './contract.ts';
import { editVersion } from './edit-version.ts';
import { requireIndicatorEditor } from './indicator-editor.ts';
import type {
  IndicatorAdminDetailRow,
  IndicatorAdminListRow,
  IndicatorAdminRow,
} from './indicator-list-repository.ts';
import { indicatorTaskList } from './indicator-task-list.ts';
import { stepsOpenTo } from './indicator-workflow.ts';
import type { InternalIndicatorRepository } from './repositories.ts';

export const INDICATORS_PAGE_SIZE = 10;

// Two indicators cannot share a slug, and the name is what the publisher chose, so the
// collision is reported against the name rather than the slug they never saw.
const NAME_TAKEN = 'An indicator with this name already exists';

function toSummary({
  draftLocked,
  draftReviewers,
  draftStatus,
  draftSubmissionStatus,
  id,
  indicatorStatus,
  name,
  teamId,
  updatedAt,
}: IndicatorAdminRow): IndicatorAdminSummary {
  return {
    id,
    name,
    teamId,
    updatedAt: updatedAt.toISOString(),
    indicatorStatus,
    draftStatus,
    draftLocked,
    draftSubmissionStatus,
    draftReviewers,
  };
}

/** What the permission checks need to know about the indicator the row describes. */
export function indicatorAccess({ teamId, draftReviewers }: IndicatorAdminRow): IndicatorAccess {
  return { teamId, reviewerIds: draftReviewers.map(({ id }) => id) };
}

export function toListItem(row: IndicatorAdminListRow): IndicatorAdminListItem {
  const { teamName, createdBy, lastEditedBy } = row;
  return { ...toSummary(row), teamName, createdBy, lastEditedBy };
}

/** The version of a draft's name, which a rename must send back. */
function nameVersion(name: string): string {
  return editVersion({ name });
}

function toDetail(row: IndicatorAdminDetailRow, user: SessionUser): IndicatorAdminDetail {
  return {
    ...toSummary(row),
    shortId: row.shortId,
    publishedSlug: row.publishedSlug,
    draftSubmissionNumber: row.draftSubmissionNumber,
    nameVersion: nameVersion(row.name),
    actions: stepsOpenTo(user, row),
  };
}

/**
 * The internal view of indicators, including the unpublished ones the public API never serves,
 * each user seeing those their roles allow. Mounted only by `internal-api`; `public-api` must
 * 404 every path.
 */
export function internalIndicatorsRouter(
  indicators: InternalIndicatorRepository,
  session: JwtSessionVerifier,
): Router {
  const router = Router();
  const requirePublisher = requireJwtRole(session, 'publisher');
  const requireLister = requireJwtSession(session, canListIndicators);
  const requireEditor = requireIndicatorEditor(session, indicators);

  router.get('/api/internal/indicators', requireLister, async (request, response) => {
    const query = indicatorPageQuerySchema.safeParse(request.query);

    if (!query.success) {
      response.status(400).json({ error: 'invalid_page' });
      return;
    }

    const filter = indicatorListTeamsQuerySchema.safeParse(request.query);

    if (!filter.success) {
      response.status(400).json({ error: 'invalid_teams' });
      return;
    }

    const { page } = query.data;
    const session = requireApiSession(response);
    const scope =
      filter.data.teams === 'own' ? ownTeamsListScope(session) : indicatorListScope(session);
    const rows = await indicators.listPage(page, INDICATORS_PAGE_SIZE, scope);
    const body: IndicatorAdminPage = {
      indicators: rows.indicators.map(toListItem),
      page,
      pageSize: INDICATORS_PAGE_SIZE,
      total: rows.total,
    };

    response.status(200).json(body);
  });

  router.post('/api/internal/indicators', requirePublisher, async (request, response) => {
    const session = requireApiSession(response);
    const team = indicatorTeamSchema.safeParse(request.body);

    if (!team.success) {
      response.status(400).json({ error: 'invalid_team' });
      return;
    }

    const { teamId } = team.data;

    if (!canCreateIndicatorInTeam(session, teamId)) {
      response.status(403).json({ error: 'forbidden' });
      return;
    }

    const submission = indicatorNameSchema.safeParse(request.body);

    if (!submission.success) {
      response.status(400).json({
        error: 'validation_failed',
        fieldErrors: toFieldErrors(submission.error, indicatorFieldSchema),
      });
      return;
    }

    const created = await indicators.createDraft(
      submission.data,
      requireApiActor(request, response),
      teamId,
    );

    if (!created.ok) {
      response.status(409).json({ error: 'slug_taken', fieldErrors: { name: NAME_TAKEN } });
      return;
    }

    request.log.info(
      { indicatorId: created.indicatorId, shortId: created.shortId },
      'Indicator created',
    );

    const row = await indicators.findById(created.indicatorId);

    if (!row) throw new Error('the indicator just created could not be read back');

    response.status(201).json(toDetail(row, session));
  });

  router.patch('/api/internal/indicators/:id', requireEditor, async (request, response) => {
    const id = indicatorIdSchema.safeParse(request.params.id);

    if (!id.success) {
      response.status(400).json({ error: 'invalid_id' });
      return;
    }

    const versioned = editVersionedSchema.safeParse(request.body);

    if (!versioned.success) {
      response.status(400).json({ error: 'invalid_version' });
      return;
    }

    const submission = indicatorNameSchema.safeParse(request.body);

    if (!submission.success) {
      // As a section save does, a locked draft answers locked before its refused answers.
      if ((await indicators.findById(id.data))?.draftLocked) {
        response.status(409).json({ error: 'locked' });
        return;
      }

      response.status(400).json({
        error: 'validation_failed',
        fieldErrors: toFieldErrors(submission.error, indicatorFieldSchema),
      });
      return;
    }

    const actor = requireApiActor(request, response);
    // No lists: the repository leaves the ones it is not given alone.
    const result = await indicators.updateDraft(id.data, submission.data, {}, actor, {
      version: versioned.data.version,
      versionOf: (draft) => nameVersion(draft.name),
    });

    if (!result.ok) {
      if (result.reason === 'changed') {
        response.status(409).json({ error: 'changed', version: result.version });
        return;
      }

      if (result.reason === 'slug_taken') {
        response.status(409).json({ error: 'slug_taken', fieldErrors: { name: NAME_TAKEN } });
        return;
      }

      if (result.reason === 'locked') {
        response.status(409).json({ error: 'locked' });
        return;
      }

      // A published indicator is edited by opening a draft first, so until then there is no
      // draft to rename and the page the publisher asked for does not exist. The read tells
      // that apart from an indicator that does not exist at all.
      const exists = (await indicators.findById(id.data)) !== undefined;
      response.status(404).json({ error: exists ? 'no_draft' : 'not_found' });
      return;
    }

    const row = await indicators.findById(id.data);

    if (!row) throw new Error('the indicator just renamed could not be read back');

    request.log.info({ indicatorId: row.id, shortId: row.shortId }, 'Indicator renamed');
    response.status(200).json(toDetail(row, requireApiSession(response)));
  });

  router.get('/api/internal/indicators/:id/task-list', requireEditor, async (request, response) => {
    const id = indicatorIdSchema.safeParse(request.params.id);

    if (!id.success) {
      response.status(400).json({ error: 'invalid_id' });
      return;
    }

    const row = await indicators.findDraftState(id.data);

    if (!row) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    // A published indicator is edited by opening a draft first, so until then there is no
    // task list to show and the page the publisher asked for does not exist.
    if (!row.draft) {
      response.status(404).json({ error: 'no_draft' });
      return;
    }

    const body: IndicatorTaskList = {
      ...indicatorTaskList({
        indicator: {
          id: row.id,
          shortId: row.shortId,
          indicatorStatus: row.indicatorStatus,
          draftStatus: row.draftStatus,
          draftSubmissionStatus: row.draftSubmissionStatus,
        },
        draft: { ...row.draft, ciMethodKind: row.draftCiMethodKind },
      }),
      draftUpdatedAt: row.draft.updatedAt.toISOString(),
      editable: !row.draft.isLocked,
      actions: stepsOpenTo(requireApiSession(response), {
        ...row,
        draftLocked: row.draft.isLocked,
      }),
    };

    response.status(200).json(body);
  });

  router.get('/api/internal/indicators/:id', requireLister, async (request, response) => {
    const id = indicatorIdSchema.safeParse(request.params.id);

    // Handing an unparseable id to the database would surface as a 500; it is a bad request.
    if (!id.success) {
      response.status(400).json({ error: 'invalid_id' });
      return;
    }

    const row = await indicators.findById(id.data);
    const session = requireApiSession(response);

    // An indicator the user may not see answers 404, as if it did not exist.
    if (!row || !canSeeIndicator(session, indicatorAccess(row))) {
      response.status(404).json({ error: 'not_found' });
      return;
    }

    response.status(200).json(toDetail(row, session));
  });

  return router;
}
