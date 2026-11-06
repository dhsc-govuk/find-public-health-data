import { createSignInRoute } from '@fphd/internal-web-features';
import { getSession } from '@fphd/web-server/session';

const signInRoute = createSignInRoute(getSession);

export const loader = signInRoute.loader;
export const meta = signInRoute.meta;
export default signInRoute.Component;
