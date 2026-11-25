import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useActionData, useLoaderData } from 'react-router';

import { indicatorDataTablePath } from '../publish-paths.ts';
import { loadDataTableCheck, submitDataTableCheck } from './check-loader.ts';
import { CheckDataTablePage } from './pages.tsx';

export const loader = loadDataTableCheck;

export const action = submitDataTableCheck;

export const meta = titleFromPage;

export const handle = backLinkHandle<Awaited<ReturnType<typeof loader>>>(({ id }) =>
  indicatorDataTablePath(id),
);

export function CheckDataTableRoute() {
  const data = useLoaderData<typeof loader>();
  const answer = useActionData<typeof action>();
  const shown =
    answer === undefined ? {} : 'formError' in answer ? answer : { filterState: answer };

  return <CheckDataTablePage {...data} {...shown} />;
}

export default CheckDataTableRoute;
