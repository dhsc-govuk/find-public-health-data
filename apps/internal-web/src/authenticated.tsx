import { canUseInternalService } from '@fphd/auth/permissions';
import { createRequireSessionMiddleware } from '@fphd/web-server/session';
import { href, Outlet } from 'react-router';

import type { Route } from './+types/authenticated';

export const middleware: Route.MiddlewareFunction[] = [
  createRequireSessionMiddleware({
    allows: canUseInternalService,
    forbiddenPath: href('/access-denied'),
    signInPath: href('/'),
  }),
];

export default function AuthenticatedInternalRoutes() {
  return <Outlet />;
}
