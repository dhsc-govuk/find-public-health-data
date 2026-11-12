import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

// WCAG 2.2 AA is the acceptance bar. axe tags each rule with the version that introduced it,
// so the 2.2 tag alone would skip every rule carried forward from 2.0 and 2.1.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
type Violation = AxeResults['violations'][number];
type ViolationNode = Violation['nodes'][number];

/**
 * A ticketed defect the scan tolerates while its fix waits. Only that rule on elements matching
 * that selector is let through, wherever the element appears, so the rest of the page is still
 * held to the bar. A page whose path matches `expectedOn` and shows the element must still show
 * the violation: once the fix lands, that page's scan fails until the entry goes.
 */
type KnownViolation = {
  expectedOn: RegExp;
  rule: string;
  selector: string;
  ticket: string;
};

const KNOWN_VIOLATIONS: KnownViolation[] = [
  {
    // GOV.UK Frontend sets aria-expanded on a radio with a conditional reveal, which ARIA does not
    // allow on role=radio, and NotGovUK copies it (alphagov/govuk-frontend#979, w3c/aria#1404).
    ticket: 'FPH-446',
    rule: 'aria-allowed-attr',
    selector: 'input.govuk-radios__input[aria-controls]',
    expectedOn:
      /^\/(publish\/indicators\/[0-9a-f-]{36}\/(calculation|confidence-intervals|other-notes-and-caveats|links|justifications|other-comments|copyright-and-data-reuse|benchmarking|sex-and-ages|tagging|period-type|value-type-and-units)|dashboard\/indicators\/[0-9a-f-]{36}\/review\/approval)$/,
  },
];

function describeViolation(violation: Violation): string {
  const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ');
  return `${violation.id} (${violation.impact}): ${violation.help} at ${targets}`;
}

async function findKnown(
  page: Page,
  violation: Violation,
  node: ViolationNode,
): Promise<KnownViolation | undefined> {
  for (const known of KNOWN_VIOLATIONS) {
    if (known.rule !== violation.id || !known.expectedOn.test(new URL(page.url()).pathname)) {
      continue;
    }
    const element = page.locator(node.target.join(' ')).first();
    if (await element.evaluate((el, selector) => el.matches(selector), known.selector)) {
      return known;
    }
  }
  return undefined;
}

/** Splits the scan's violations into those still to report and the known ones it matched. */
async function separateKnown(page: Page, violations: Violation[]) {
  const seen = new Set<KnownViolation>();
  const unknown: Violation[] = [];
  for (const violation of violations) {
    const nodes: ViolationNode[] = [];
    for (const node of violation.nodes) {
      const known = await findKnown(page, violation, node);
      if (known) {
        seen.add(known);
      } else {
        nodes.push(node);
      }
    }
    if (nodes.length > 0) {
      unknown.push({ ...violation, nodes });
    }
  }
  return { seen, unknown };
}

/** Scans the page as it currently stands; call it after driving the page into the state under test. */
export async function expectNoAccessibilityViolations(page: Page, testInfo: TestInfo) {
  const { incomplete, violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const { seen, unknown } = await separateKnown(page, violations);
  // `incomplete` is what axe could not decide, such as text over a gradient: the manual-review
  // list, attached alongside so a failure carries everything the scan had to say.
  if (unknown.length > 0) {
    await testInfo.attach('axe-results.json', {
      body: JSON.stringify({ violations: unknown, incomplete }, null, 2),
      contentType: 'application/json',
    });
  }
  expect(unknown.map(describeViolation)).toEqual([]);

  const pathname = new URL(page.url()).pathname;
  const fixed: KnownViolation[] = [];
  for (const known of KNOWN_VIOLATIONS) {
    if (!known.expectedOn.test(pathname) || seen.has(known)) continue;
    // The scan judges what the page shows, so an entry whose element this page's state keeps
    // hidden was never up for a verdict and says nothing about whether the fix has landed.
    if ((await page.locator(`${known.selector}:visible`).count()) > 0) fixed.push(known);
  }
  expect(
    fixed.map((known) => known.ticket),
    'known violations no longer seen on this page: remove them from KNOWN_VIOLATIONS',
  ).toEqual([]);
}
