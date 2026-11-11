import { canEditIndicator } from '@fphd/auth/permissions';
import { getSession } from '@fphd/web-server/session';
import type { RouterContext } from 'react-router';

type SessionReader = { get<T>(context: RouterContext<T>): T };

/** A publish page for an indicator the user may not edit does not exist, as the API answers. */
export function requireEditableIndicator(
  context: SessionReader,
  indicator: { teamId: string },
): void {
  const session = getSession(context);

  if (session === undefined || !canEditIndicator(session, indicator)) {
    throw new Response('Not Found', { status: 404 });
  }
}
