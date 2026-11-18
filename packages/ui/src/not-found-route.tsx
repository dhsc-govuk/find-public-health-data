import { data } from 'react-router';

import { NotFoundPage, notFoundHeading } from './content-page.tsx';
import { createDocumentMeta } from './document-title.tsx';

export function loader() {
  return data(null, { status: 404 });
}

export const meta = createDocumentMeta(notFoundHeading);

export default NotFoundPage;
