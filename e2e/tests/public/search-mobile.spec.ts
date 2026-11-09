import { devices, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { mobileFilterTests, mobileSearchTests } from '../support/search-mobile.ts';

test.use({ ...devices['Pixel 7'] });

mobileSearchTests((page, testInfo) => expectNoAccessibilityViolations(page, testInfo));

mobileFilterTests((page, testInfo) => expectNoAccessibilityViolations(page, testInfo));
