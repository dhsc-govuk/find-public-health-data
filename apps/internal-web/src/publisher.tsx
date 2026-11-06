import { canEditIndicators } from '@fphd/auth/permissions';
import { createRequireSessionMiddleware } from '@fphd/web-server/session';
import { href, Outlet } from 'react-router';

import type { Route } from './+types/publisher';

export const middleware: Route.MiddlewareFunction[] = [
  createRequireSessionMiddleware({
    allows: canEditIndicators,
    forbiddenPath: href('/access-denied'),
    signInPath: href('/'),
  }),
];

export default function PublisherRoutes() {
  return <Outlet />;
}
