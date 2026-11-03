import { requireApiActor, requireApiSession, requireJwtSession } from '@fphd/api-server';
import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { canListIndicators, canWriteReviewerNotes } from '@fphd/auth/permissions';
import { type Request, type Response, Router } from 'express';

import {
  indicatorAccess,
  indicatorIdSchema,
  type ReviewerNote,
  type ReviewerNoteError,
  type ReviewerNotes,
  reviewerNoteAddBodySchema,
  reviewerNoteFieldSchema,
  reviewerNoteIdSchema,
  reviewerNoteTextFormSchema,
  reviewerNoteUpdateBodySchema,
  toFieldErrors,
} from './contract.ts';
import type {
  InternalIndicatorRepository,
  InternalReviewerNoteRepository,
} from './repositories.ts';
import { type ReviewerNoteRow, reviewerNoteVersion } from './reviewer-note-repository.ts';

const PATH = '/api/internal/indicators/:id/reviewer-notes';

function toNote(note: ReviewerNoteRow): ReviewerNote {
  return {
    id: note.id,
    text: note.text,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    version: reviewerNoteVersion(note),
  };
}

/** The note's text once its rules pass, or undefined once the refusal is sent. */
function checkedText(text: string, response: Response): string | undefined {
  const checked = reviewerNoteTextFormSchema.safeParse({ text });

  if (checked.success) return checked.data.text;

  response.status(400).json({
    error: 'validation_failed',
    fieldErrors: toFieldErrors(checked.error, reviewerNoteFieldSchema),
  } satisfies ReviewerNoteError);
  return undefined;
}

/**
 * An assigned reviewer's own notes on an indicator, which nobody else reads. Anyone else gets
 * 404 `not_found`, as for any indicator the user may not see.
 */
export function reviewerNotesRouter(
  reviewerNotes: InternalReviewerNoteRepository,
  indicators: Pick<InternalIndicatorRepository, 'findAccess'>,
  session: JwtSessionVerifier,
): Router {
  const router = Router();
  const guard = requireJwtSession(session, canListIndicators);

  /** The indicator `:id` names, once the user may keep notes on it; undefined once refused. */
  async function notedIndicatorId(request: Request, response: Response) {
    const id = indicatorIdSchema.safeParse(request.params.id);

    if (!id.success) {
      response.status(400).json({ error: 'invalid_id' } satisfies ReviewerNoteError);
      return undefined;
    }

    const row = await indicators.findAccess(id.data);

    if (
      row === undefined ||
      !canWriteReviewerNotes(requireApiSession(response), indicatorAccess(row))
    ) {
      response.status(404).json({ error: 'not_found' });
      return undefined;
    }

    return id.data;
  }

  router.get(PATH, guard, async (request, response) => {
    const id = await notedIndicatorId(request, response);

    if (id === undefined) return;

    const notes = await reviewerNotes.list(id, requireApiSession(response).sub);

    response.status(200).json({ notes: notes.map(toNote) } satisfies ReviewerNotes);
  });

  router.post(PATH, guard, async (request, response) => {
    const id = await notedIndicatorId(request, response);

    if (id === undefined) return;

    const body = reviewerNoteAddBodySchema.safeParse(request.body);

    if (!body.success) {
      response.status(400).json({ error: 'invalid_request' } satisfies ReviewerNoteError);
      return;
    }

    const text = checkedText(body.data.text, response);

    if (text === undefined) return;

    const result = await reviewerNotes.add(id, text, requireApiActor(request, response));

    if (!result.ok) {
      response.status(409).json({ error: result.reason } satisfies ReviewerNoteError);
      return;
    }

    request.log.info({ indicatorId: id, noteId: result.note.id }, 'Reviewer note added');
    response.status(204).end();
  });

  router.put(`${PATH}/:noteId`, guard, async (request, response) => {
    const id = await notedIndicatorId(request, response);

    if (id === undefined) return;

    const noteId = reviewerNoteIdSchema.safeParse(request.params.noteId);

    if (!noteId.success) {
      response.status(400).json({ error: 'invalid_id' } satisfies ReviewerNoteError);
      return;
    }

    const body = reviewerNoteUpdateBodySchema.safeParse(request.body);

    if (!body.success) {
      response.status(400).json({ error: 'invalid_request' } satisfies ReviewerNoteError);
      return;
    }

    const text = checkedText(body.data.text, response);

    if (text === undefined) return;

    const result = await reviewerNotes.update(
      id,
      noteId.data,
      text,
      { version: body.data.version, versionOf: reviewerNoteVersion },
      requireApiActor(request, response),
    );

    if (!result.ok) {
      response
        .status(result.reason === 'not_found' ? 404 : 409)
        .json(
          (result.reason === 'changed'
            ? { error: 'changed', version: result.version }
            : { error: result.reason }) satisfies ReviewerNoteError | { error: 'not_found' },
        );
      return;
    }

    request.log.info({ indicatorId: id, noteId: noteId.data }, 'Reviewer note updated');
    response.status(200).json(toNote(result.note));
  });

  return router;
}
