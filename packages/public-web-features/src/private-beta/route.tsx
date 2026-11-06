import { titleFromPage } from '@fphd/ui';
import { useActionData, useLoaderData } from 'react-router';

import {
  loadPrivateBeta,
  type PrivateBetaData,
  type PrivateBetaRequest,
  requestPrivateBetaLink,
} from './loader.ts';
import { PrivateBetaPage } from './pages.tsx';

export const loader = loadPrivateBeta;

export const action = requestPrivateBetaLink;

export const meta = titleFromPage;

export function PrivateBetaRoute() {
  const data = useLoaderData<PrivateBetaData>();
  const request = useActionData<PrivateBetaRequest | undefined>();

  return <PrivateBetaPage data={data} request={request} />;
}

export default PrivateBetaRoute;
