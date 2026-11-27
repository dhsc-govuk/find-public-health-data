import type { Locator, Page, Request } from '@playwright/test';

/**
 * Where to press the button with the mouse, as a person does. Found once, before the first press:
 * the page then waits on the form, and a locator would wait with it.
 */
async function pressPoint(button: Locator): Promise<{ x: number; y: number }> {
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (box === null) throw new Error('The button to press is not on the page');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Presses `button` twice, as in a double click, while the form its first press sent to `path` is
 * still on its way: the second press comes once that form has gone out, and the form is held
 * until then. Answers how many forms the page sent to `path`.
 */
export async function pressTwiceWhileSending(
  page: Page,
  button: Locator,
  path: string,
): Promise<() => number> {
  const isForm = (request: Request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === path;
  let sent = 0;
  page.on('request', (request) => {
    if (isForm(request)) sent += 1;
  });
  const pressedAgain = Promise.withResolvers<void>();
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() === 'POST') await pressedAgain.promise;
    // The browser drops a form it sends again, which leaves nothing to continue.
    await route.continue().catch(() => {});
  });

  const { x, y } = await pressPoint(button);
  // A second press straight after the first can be folded into it, so it waits for the form.
  const firstSent = page.waitForRequest(isForm);
  await page.mouse.click(x, y);
  await firstSent;
  await page.mouse.click(x, y);
  pressedAgain.resolve();

  return () => sent;
}
