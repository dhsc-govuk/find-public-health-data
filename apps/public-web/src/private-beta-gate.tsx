import { betaAccessMiddleware } from '@fphd/beta-access/gate';
import { Outlet } from 'react-router';

import type { Route } from './+types/private-beta-gate';

export const middleware: Route.MiddlewareFunction[] = [betaAccessMiddleware];

export default function PrivateBetaGate() {
  return <Outlet />;
}
