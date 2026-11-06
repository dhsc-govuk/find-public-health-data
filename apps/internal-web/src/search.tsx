import { createSearchRoute } from '@fphd/public-web-features';

const searchRoute = createSearchRoute(false);
export const loader = searchRoute.loader;
export const meta = searchRoute.meta;
export const shouldRevalidate = searchRoute.shouldRevalidate;
export default searchRoute.Component;
