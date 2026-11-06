import { canManage } from '@fphd/auth/permissions';
import { createRequireSessionMiddleware } from '@fphd/web-server/session';
import { href, Outlet } from 'react-router';

import type { Route } from './+types/admin';

export const middleware: Route.MiddlewareFunction[] = [
  createRequireSessionMiddleware({
    allows: canManage,
    forbiddenPath: href('/access-denied'),
    signInPath: href('/'),
  }),
];

export default function AdminRoutes() {
  return <Outlet />;
}
