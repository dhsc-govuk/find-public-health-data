import { devices, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { mobileFilterTests } from '../support/search-mobile.ts';

test.use({ ...devices['Pixel 7'] });

mobileFilterTests((page, testInfo) => expectNoAccessibilityViolations(page, testInfo));
