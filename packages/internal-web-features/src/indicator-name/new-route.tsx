import { backLinkHandle, titleFromPage } from '@fphd/ui';
import { useActionData, useLoaderData } from 'react-router';
import { DASHBOARD_PATH } from '../dashboard/paths.ts';
import { createIndicator, type IndicatorNameFailure, loadNewIndicator } from './loader.ts';
import { IndicatorNamePage } from './page.tsx';

export const loader = loadNewIndicator;

export const action = createIndicator;

export const meta = titleFromPage;

export const handle = backLinkHandle(DASHBOARD_PATH, 'Back to indicators');

export function NewIndicatorRoute() {
  const { id } = useLoaderData<typeof loader>();
  const rejected = useActionData<IndicatorNameFailure | undefined>();

  return (
    <IndicatorNamePage
      fieldErrors={rejected?.fieldErrors}
      formError={rejected?.formError}
      name={rejected?.values.name}
      newIndicatorId={id}
    />
  );
}

export default NewIndicatorRoute;
