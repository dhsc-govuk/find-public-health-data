import { backLinkFrom } from '@fphd/ui';
import { expect, it } from 'vitest';

import { indicatorPreviewHandle } from './back-link.ts';

const id = '00000000-0000-7000-8000-000000000001';

function backLink(from: 'task-list' | 'overview') {
  return backLinkFrom([
    {
      id: 'preview',
      pathname: '/',
      params: {},
      handle: indicatorPreviewHandle,
      loaderData: { preview: { id, from } },
    },
  ]);
}

it('goes back to the task list the preview was opened from', () => {
  expect(backLink('task-list')).toEqual({
    href: `/publish/indicators/${id}/task-list`,
    text: 'Back to task list',
  });
});

it('goes back to the indicator overview otherwise', () => {
  expect(backLink('overview')).toEqual({
    href: `/dashboard/indicators/${id}`,
    text: 'Back to indicator overview',
  });
});
