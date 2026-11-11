import { expect, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectHydrated } from '../support/govuk-frontend.ts';
import { openSectionPage } from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';

// Every page a publisher fills in, so a new one is covered by being added here.
const SECTIONS = [
  'definition-and-rationale',
  'polarity',
  'data-quality',
  'numerator',
  'denominator',
  'calculation',
  'confidence-intervals',
  'update-frequency',
  'period-type',
  'value-type-and-units',
  'other-notes-and-caveats',
  'publishing-date',
  'variance-and-quality',
  'justifications',
  'other-comments',
  'copyright-and-data-reuse',
  'benchmarking',
  'sex-and-ages',
  'ages',
  'tagging',
];

test.use({ storageState: PUBLISHER.storageState });

/**
 * The rule FPH-500 is about: a question the page asks is a heading, whatever control answers it
 * and whatever size its level gives it. Questions revealed by choosing an option, and the parts
 * of one answer such as the day of a date, are not the page's own questions and are left out.
 */
for (const key of SECTIONS) {
  test(`asks every question on ${key} as a heading`, async ({ page }, testInfo) => {
    await openSectionPage(page, { key, taskName: key });
    // Hydration hides the questions an answer reveals, which the server's markup shows.
    await expectHydrated(page);

    const plain = await page.evaluate(() =>
      [...document.querySelectorAll('main label.govuk-label, main legend')]
        .filter((el) => {
          if (/govuk-(radios|checkboxes)__label/.test(el.className)) return false;
          // Revealed by choosing an option, so it follows that answer rather than being a
          // question the page asks. A field merely hidden until it applies still is one.
          if (el.closest('.govuk-radios__conditional, .govuk-checkboxes__conditional'))
            return false;
          // One part of a grouped answer, such as the day of a date, named by its legend.
          return !(
            el.tagName === 'LABEL' && el.closest('fieldset')?.querySelector(':scope > legend')
          );
        })
        // A heading either wraps the label or sits inside the legend. Asking for the element
        // rather than the weight it renders at also catches one styled bold without being one.
        .filter(
          (el) =>
            !el.querySelector('h1, h2, h3, h4, h5, h6') &&
            !/^H[1-6]$/.test(el.parentElement?.tagName ?? ''),
        )
        .map((el) => el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60)),
    );

    expect(plain).toEqual([]);
    await expectNoAccessibilityViolations(page, testInfo);
  });
}
