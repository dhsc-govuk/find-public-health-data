import { setFlash } from '@fphd/web-server/flash';

type FlashContext = Parameters<typeof setFlash>[0];

/** A message for the dashboard to show: a success, or something the user needs to know. */
export interface DashboardNotification {
  type: 'success' | 'important';
  text: string;
}

/** Resolved on the server so a cookie value is only ever a key into copy written here. */
const NOTIFICATIONS = {
  'no-longer-reviewer': {
    type: 'important',
    text: 'You are no longer a reviewer of this indicator.',
  },
  'draft-discarded': { type: 'success', text: 'Draft discarded.' },
  'already-discarded': {
    type: 'important',
    text: 'This draft has already been discarded.',
  },
  'discard-unfinished': {
    type: 'important',
    text: 'This draft is taking a long time to discard. Check again in a few minutes.',
  },
} as const satisfies Record<string, DashboardNotification>;

export type DashboardFlash = keyof typeof NOTIFICATIONS;

/** Leaves the dashboard a message to show once the user is redirected to it. */
export function setDashboardFlash(context: FlashContext, flash: DashboardFlash): void {
  setFlash(context, flash);
}

/** The message a flash asks for, or none for a flash the dashboard does not know. */
export function dashboardNotification(
  flash: string | undefined,
): DashboardNotification | undefined {
  return flash !== undefined && Object.hasOwn(NOTIFICATIONS, flash)
    ? NOTIFICATIONS[flash as DashboardFlash]
    : undefined;
}
