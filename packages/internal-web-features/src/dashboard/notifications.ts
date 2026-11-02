import { setFlash } from '@fphd/web-server/flash';

type FlashContext = Parameters<typeof setFlash>[0];

/** Resolved on the server so a cookie value is only ever a key into copy written here. */
const NOTIFICATIONS = {
  'no-longer-reviewer': 'You are no longer a reviewer of this indicator.',
} as const satisfies Record<string, string>;

export type DashboardFlash = keyof typeof NOTIFICATIONS;

/** Leaves the dashboard something the user needs to know once they are redirected to it. */
export function setDashboardFlash(context: FlashContext, flash: DashboardFlash): void {
  setFlash(context, flash);
}

/** The message a flash asks for, or none for a flash the dashboard does not know. */
export function dashboardNotification(flash: string | undefined): string | undefined {
  return flash !== undefined && Object.hasOwn(NOTIFICATIONS, flash)
    ? NOTIFICATIONS[flash as DashboardFlash]
    : undefined;
}
