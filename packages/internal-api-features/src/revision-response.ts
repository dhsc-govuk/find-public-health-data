import { requireApiActor } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { type Request, type Response, Router } from 'express';

import {
  indicatorIdSchema,
  type RevisionResponse,
  type RevisionResponseError,
  revisionKindSchema,
  revisionResponseFieldSchema,
  revisionResponseFormSchemaFor,
  revisionResponseSaveBodySchema,
  toFieldErrors,
} from './contract.ts';
import { requireIndicatorEditor } from './indicator-editor.ts';
import type { InternalIndicatorRepository } from './repositories.ts';
import { type RevisionRoundRow, revisionReplyVersion } from './revision-response-repository.ts';

const PATH = '/api/internal/indicators/:id/revision-response';

type Refusal = RevisionResponseError | { error: 'not_found' | 'no_draft' };

/** The reply and what it answers, or the refusal while the draft has no round sent back. */
function replyOf(round: RevisionRoundRow | undefined): RevisionResponse | [number, Refusal] {
  if (round === undefined) return [404, { error: 'not_found' }];
  if (!round.hasDraft) return [404, { error: 'no_draft' }];
  if (round.draftLocked) return [409, { error: 'locked' }];

  const kind = revisionKindSchema.safeParse(round.kind);

  if (round.submissionStatus !== 'changes_requested' || !kind.success) {
    return [409, { error: 'not_allowed' }];
  }

  return {
    kind: kind.data,
    clarificationRequest: round.clarificationRequest?.notes ?? null,
    flaggedTaskCount: round.flags.length,
    revisionResponse: round.revisionResponse,
    version: revisionReplyVersion(round),
  };
}

/**
 * The publisher's reply to the round of review that sent their draft back, behind the editor
 * guard. Both answer the reply and the version a save sends back.
 *
 * - 404 `not_found` or `no_draft`: no indicator, or nothing to edit.
 * - 409 `locked`: the draft is in review; `not_allowed`: no round has sent it back.
 * - PUT: 400 `invalid_request` for a malformed body, `validation_failed` for an empty or
 *   overlong reply; 409 `changed`, with the current version, when someone has written the reply
 *   since the page was shown.
 */
export function revisionResponseRouter(
  indicators: Pick<
    InternalIndicatorRepository,
    'findTeamId' | 'findRevisionRound' | 'saveRevisionResponse'
  >,
  session: JwtSessionVerifier,
): Router {
  const router = Router();
  const requireEditor = requireIndicatorEditor(session, indicators);

  /** The id `:id` names, or undefined once the refusal is sent. */
  function indicatorId(request: Request, response: Response): string | undefined {
    const id = indicatorIdSchema.safeParse(request.params.id);

    if (id.success) return id.data;

    response.status(400).json({ error: 'invalid_id' } satisfies Refusal);
    return undefined;
  }

  /** The indicator's reply, or undefined once the refusal is sent. */
  async function currentReply(id: string, response: Response) {
    const reply = replyOf(await indicators.findRevisionRound(id));

    if (!Array.isArray(reply)) return reply;

    const [status, refusal] = reply;
    response.status(status).json(refusal);
    return undefined;
  }

  router.get(PATH, requireEditor, async (request, response) => {
    const id = indicatorId(request, response);
    const reply = id === undefined ? undefined : await currentReply(id, response);

    if (reply !== undefined) response.status(200).json(reply);
  });

  router.put(PATH, requireEditor, async (request, response) => {
    const id = indicatorId(request, response);

    if (id === undefined) return;

    const body = revisionResponseSaveBodySchema.safeParse(request.body);

    if (!body.success) {
      response.status(400).json({ error: 'invalid_request' } satisfies Refusal);
      return;
    }

    // Read first, so a locked draft answers locked before its refused text, as a section does.
    const current = await currentReply(id, response);

    if (current === undefined) return;

    const checked = revisionResponseFormSchemaFor(current).safeParse(body.data);

    if (!checked.success) {
      response.status(400).json({
        error: 'validation_failed',
        fieldErrors: toFieldErrors(checked.error, revisionResponseFieldSchema),
      } satisfies Refusal);
      return;
    }

    const result = await indicators.saveRevisionResponse(
      id,
      checked.data.revisionResponse,
      { version: body.data.version, versionOf: revisionReplyVersion },
      requireApiActor(request, response),
    );

    if (!result.ok) {
      response
        .status(result.reason === 'no_draft' ? 404 : 409)
        .json(
          (result.reason === 'changed'
            ? { error: 'changed', version: result.version }
            : { error: result.reason }) satisfies Refusal,
        );
      return;
    }

    request.log.info({ indicatorId: id }, 'Revision response saved');
    response.status(200).json({
      ...current,
      revisionResponse: checked.data.revisionResponse,
      version: result.version,
    } satisfies RevisionResponse);
  });

  return router;
}
