import { expect, type Page, test } from '@playwright/test';

import { expectNoAccessibilityViolations } from '../support/accessibility.ts';
import { expectErrorSummaryReady } from '../support/govuk-frontend.ts';
import {
  describeSectionPage,
  openSectionPage,
  type Section,
  taskRow,
} from '../support/section-page.ts';
import { PUBLISHER } from '../support/sign-in.ts';
import { ANSWER_DETAIL, expectQuestionStyles, QUESTION } from '../support/typography.ts';

type TextQuestion = { label: string; refusal: string };

/** A Yes/No question whose details field shows while Yes is chosen. */
type YesNoQuestion = {
  legend: string;
  details: string;
  refusal: string;
  detailsRefusal: string;
  hint?: string;
  /** An answer besides Yes and No, which asks for no details. */
  otherAnswer?: string;
};

/** A section page of free-text questions followed by Yes/No questions with details. */
type YesNoSection = {
  section: Section;
  heading: string;
  textQuestions: TextQuestion[];
  /** Labels of the free-text questions a publisher may leave unanswered. */
  optionalText?: string[];
  questions: [YesNoQuestion, ...YesNoQuestion[]];
  /** Set for the notes for reviewers, whose pages say the answers are for reviewers alone. */
  forReviewers?: true;
};

const REVIEWER_USE_ONLY = 'The information you provide here is for reviewer use only';

const SECTIONS: YesNoSection[] = [
  {
    section: { key: 'other-notes-and-caveats', taskName: 'Other notes and caveats' },
    heading: 'Provide any other notes and caveats',
    textQuestions: [],
    questions: [
      {
        legend: 'Has disclosure control been applied?',
        details: 'Provide details',
        refusal: 'Select whether disclosure control has been applied',
        detailsRefusal: 'Provide details of the disclosure control',
        otherAnswer: 'Not applicable',
      },
      {
        legend: 'Has any rounding been applied?',
        details: 'Provide details',
        refusal: 'Select whether rounding has been applied',
        detailsRefusal: 'Provide details of the rounding',
      },
      {
        legend: 'Are there any caveats needed?',
        details: 'Provide details',
        refusal: 'Select whether there are any caveats needed',
        detailsRefusal: 'Provide details of the caveats',
      },
      {
        legend: 'Are there any other notes needed?',
        details: 'Provide details',
        refusal: 'Select whether there are any other notes needed',
        detailsRefusal: 'Provide details of the other notes',
      },
    ],
  },
  {
    section: { key: 'copyright-and-data-reuse', taskName: 'Copyright and data re-use' },
    heading: 'Copyright and data re-use',
    textQuestions: [],
    questions: [
      {
        legend: 'Is the copyright different to the default?',
        details: 'Provide details',
        refusal: 'Select whether the copyright is anything other than Crown copyright',
        detailsRefusal: 'Provide details of the copyright',
        hint: 'The default is "© Crown copyright"',
      },
      {
        legend: 'Is the data re-use different to the default?',
        details: 'Provide details',
        refusal: 'Select whether the data re-use is different to the default',
        detailsRefusal: 'Provide details of the data re-use',
        hint: 'The default is "The data may be used referencing Office for Health Improvement and Disparities"',
      },
    ],
  },
  {
    forReviewers: true,
    section: { key: 'variance-and-quality', taskName: 'Variance and quality' },
    heading: 'Variance and quality',
    textQuestions: [
      { label: 'How does the indicator vary?', refusal: 'Enter how the indicator varies' },
      {
        label: 'What quality assurance has been done on the indicator?',
        refusal: 'Enter what quality assurance has been done on the indicator',
      },
    ],
    questions: [
      {
        legend: 'Are there any data quality issues with the source data?',
        details:
          'Enter details, including what is being done to improve the quality of the source data',
        refusal: 'Select whether there are any data quality issues with the source data',
        detailsRefusal: 'Enter details of the data quality issues with the source data',
      },
    ],
  },
  {
    forReviewers: true,
    section: { key: 'justifications', taskName: 'Justifications' },
    heading: 'Justifications',
    textQuestions: [
      {
        label: 'Why was the confidence interval method chosen?',
        refusal: 'Enter why the confidence interval method was chosen',
      },
      {
        label: 'Why were the data sources chosen?',
        refusal: 'Enter why the data sources were chosen',
      },
      {
        label: 'What health inequalities have been included?',
        refusal: 'Enter what health inequalities have been included',
      },
    ],
    questions: [
      {
        legend: 'Have there been any exclusions?',
        details: 'Enter why exclusions were made',
        refusal: 'Select whether there have been any exclusions',
        detailsRefusal: 'Enter why exclusions were made',
      },
      {
        legend: 'Have internal automation tools been used to create this indicator?',
        details: 'Enter details of the tools used',
        refusal: 'Select whether internal automation tools have been used',
        detailsRefusal: 'Enter details of the tools used',
      },
    ],
  },
  {
    forReviewers: true,
    section: { key: 'other-comments', taskName: 'Other comments' },
    heading: 'Other comments',
    textQuestions: [],
    optionalText: ['Enter any applicable sponsors or stakeholders for this indicator (optional)'],
    questions: [
      {
        legend: 'Are there any other comments for the reviewers?',
        details: 'Enter comments',
        refusal: 'Select whether you have additional comments',
        detailsRefusal: 'Enter your comments',
      },
    ],
  },
];

function answer(page: Page, { legend }: YesNoQuestion, label: string) {
  return page.getByRole('group', { name: legend }).getByLabel(label, { exact: true });
}

function details(page: Page, { legend, details }: YesNoQuestion) {
  return page.getByRole('group', { name: legend }).getByLabel(details);
}

function checkedRadios(page: Page) {
  return page.getByRole('main').getByRole('radio', { checked: true });
}

function textAnswer(label: string) {
  return `Answered: ${label}`;
}

function detailsAnswer({ legend }: YesNoQuestion) {
  return `Details for: ${legend}`;
}

function continueForm(page: Page) {
  return page.getByRole('button', { name: 'Continue' }).click();
}

test.use({ storageState: PUBLISHER.storageState });

for (const {
  section,
  heading,
  textQuestions,
  optionalText = [],
  questions,
  forReviewers = false,
} of SECTIONS) {
  const [first, ...rest] = questions;
  const requiredText = textQuestions.map(({ label }) => label);
  const allText = [...optionalText, ...requiredText];
  // Refused for want of details: Yes everywhere, but another answer where a question has one.
  const answerWithoutDetails = (question: YesNoQuestion) => question.otherAnswer ?? 'Yes';
  const askingDetails = questions.filter(({ otherAnswer }) => otherAnswer === undefined);
  const lastAskingDetails = askingDetails.at(-1) ?? first;

  /** Fills free-text questions, each answer between `pad`s that are saved trimmed. */
  async function fillText(page: Page, labels = allText, pad = '') {
    for (const label of labels) {
      await page.getByLabel(label).fill(`${pad}${textAnswer(label)}${pad}`);
    }
  }

  /** Answers every question, Yes with its details but for those in `no`. */
  async function answerEvery(page: Page, no: YesNoQuestion[] = []) {
    await fillText(page, allText, '  ');
    for (const question of questions) {
      if (no.includes(question)) {
        await answer(page, question, 'No').check();
      } else {
        await answer(page, question, 'Yes').check();
        await details(page, question).fill(`  ${detailsAnswer(question)}  `);
      }
    }
  }

  async function submitWithoutDetails(page: Page) {
    await fillText(page);
    for (const question of questions) {
      await answer(page, question, answerWithoutDetails(question)).check();
    }
    await continueForm(page);
  }

  test.describe(section.taskName, () => {
    describeSectionPage(section, {
      expectUnanswered: async (page) => {
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        await expect(page.getByText(REVIEWER_USE_ONLY)).toHaveCount(forReviewers ? 1 : 0);
        for (const label of allText) {
          await expect(page.getByLabel(label)).toBeEmpty();
        }
        await expect(checkedRadios(page)).toHaveCount(0);
        for (const { legend, hint } of questions) {
          const group = page.getByRole('group', { name: legend });
          await expect(group).toBeVisible();
          if (hint !== undefined) await expect(group).toContainText(hint);
        }
      },
      refusal: {
        // Never empty: every page here has a Yes/No question.
        messages: [
          ...textQuestions.map(({ refusal }) => refusal),
          ...questions.map(({ refusal }) => refusal),
        ] as [string, ...string[]],
        follow: first.refusal,
        focuses: (page) => answer(page, first, 'Yes'),
      },
    });

    // The size and weight come from a class, so only a browser can tell them apart. Asserted
    // against the values rather than against each other, so that a page losing them all together
    // still fails.
    test('asks every question at the same size and weight', async ({ page }) => {
      await openSectionPage(page, section);

      await expectQuestionStyles(
        page,
        [...allText, ...questions.map(({ legend }) => legend)],
        QUESTION,
      );

      // The details a Yes asks for follow the question rather than asking one, so they are not
      // headings. Benchmarking reveals further questions instead, and makes those headings.
      await expectQuestionStyles(
        page,
        questions.map((question) => question.details),
        ANSWER_DETAIL,
      );
    });

    test('reveals the details of each question only while Yes is chosen', async ({ page }) => {
      await openSectionPage(page, section);

      for (const question of questions) {
        await expect(details(page, question)).toBeHidden();

        await answer(page, question, 'Yes').check();
        await expect(details(page, question)).toBeVisible();
        for (const other of questions.filter((other) => other !== question)) {
          await expect(details(page, other)).toBeHidden();
        }

        await answer(page, question, 'No').check();
        await expect(details(page, question)).toBeHidden();
      }
    });

    test('asks for the details of each question answered Yes without them', async ({ page }) => {
      await openSectionPage(page, section);

      await submitWithoutDetails(page);

      const summary = page.getByRole('alert');
      await expect(summary.getByRole('link')).toHaveText(
        askingDetails.map(({ detailsRefusal }) => detailsRefusal),
      );
      for (const label of allText) {
        await expect(page.getByLabel(label)).toHaveValue(textAnswer(label));
      }
      for (const question of questions) {
        await expect(answer(page, question, answerWithoutDetails(question))).toBeChecked();
      }

      await expectErrorSummaryReady(page);
      await summary
        .getByRole('link', { name: lastAskingDetails.detailsRefusal, exact: true })
        .click();
      await expect(details(page, lastAskingDetails)).toBeFocused();
    });

    test('saves nothing until every answer is given', async ({ page }) => {
      await openSectionPage(page, section);
      const pagePath = new URL(page.url()).pathname;

      await submitWithoutDetails(page);
      await expect(page.getByRole('alert')).toBeVisible();

      await page.goto(pagePath);
      for (const label of allText) {
        await expect(page.getByLabel(label)).toBeEmpty();
      }
      await expect(checkedRadios(page)).toHaveCount(0);
    });

    test('saves every answer on Continue and shows the task as completed', async ({ page }) => {
      const taskListPath = await openSectionPage(page, section);

      await answerEvery(page, rest);
      await continueForm(page);

      await expect(page).toHaveURL(taskListPath);
      await expect(taskRow(page, section.taskName)).toContainText('Completed');

      await taskRow(page, section.taskName).getByRole('link').click();
      for (const label of allText) {
        await expect(page.getByLabel(label)).toHaveValue(textAnswer(label));
      }
      await expect(answer(page, first, 'Yes')).toBeChecked();
      await expect(details(page, first)).toHaveValue(detailsAnswer(first));
      for (const question of rest) {
        await expect(answer(page, question, 'No')).toBeChecked();
      }
    });

    if (optionalText.length > 0) {
      test('completes the task with the optional questions unanswered', async ({ page }) => {
        const taskListPath = await openSectionPage(page, section);

        await fillText(page, requiredText);
        for (const question of questions) {
          await answer(page, question, 'No').check();
        }
        await continueForm(page);

        await expect(page).toHaveURL(taskListPath);
        await expect(taskRow(page, section.taskName)).toContainText('Completed');

        await taskRow(page, section.taskName).getByRole('link').click();
        for (const label of optionalText) {
          await expect(page.getByLabel(label)).toBeEmpty();
        }
        await expect(answer(page, first, 'No')).toBeChecked();
      });
    }

    test('forgets the details of a question once it is answered No instead', async ({ page }) => {
      await openSectionPage(page, section);
      const pagePath = new URL(page.url()).pathname;
      await answerEvery(page);
      await continueForm(page);
      await expect(taskRow(page, section.taskName)).toContainText('Completed');

      await page.goto(pagePath);
      await answer(page, first, 'No').check();
      await continueForm(page);
      await expect(taskRow(page, section.taskName)).toContainText('Completed');

      await page.goto(pagePath);
      await expect(answer(page, first, 'No')).toBeChecked();
      for (const question of rest) {
        await expect(details(page, question)).toHaveValue(detailsAnswer(question));
      }
      await answer(page, first, 'Yes').check();
      await expect(details(page, first)).toBeEmpty();
    });

    test('has no WCAG 2.2 AA violations', async ({ page }, testInfo) => {
      await openSectionPage(page, section);

      await expectNoAccessibilityViolations(page, testInfo);
    });

    test('has no WCAG 2.2 AA violations when the answers are refused', async ({
      page,
    }, testInfo) => {
      await openSectionPage(page, section);
      await continueForm(page);
      await expect(page.getByRole('alert')).toContainText(first.refusal);

      await expectNoAccessibilityViolations(page, testInfo);
    });

    test('has no WCAG 2.2 AA violations when details are refused', async ({ page }, testInfo) => {
      await openSectionPage(page, section);
      await submitWithoutDetails(page);
      await expect(page.getByRole('alert')).toContainText(lastAskingDetails.detailsRefusal);

      await expectNoAccessibilityViolations(page, testInfo);
    });

    test.describe('without JavaScript', () => {
      test.use({ javaScriptEnabled: false });

      test('shows every details field and saves the answers', async ({ page }) => {
        const taskListPath = await openSectionPage(page, section);

        for (const question of questions) {
          await expect(details(page, question)).toBeVisible();
        }

        await answerEvery(page);
        await continueForm(page);

        await expect(page).toHaveURL(taskListPath);
        await expect(taskRow(page, section.taskName)).toContainText('Completed');
      });
    });
  });
}

test.describe('Justifications without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('saves the largest answers the page takes: five of 10,000 characters', async ({ page }) => {
    const justifications = SECTIONS.find(({ section }) => section.key === 'justifications');
    if (justifications === undefined) throw new Error('no justifications section to test');
    // An emoji is one character that takes 4 bytes, the most any character takes.
    const longest = '\u{1F600}'.repeat(10_000);
    const taskListPath = await openSectionPage(page, justifications.section);

    for (const { label } of justifications.textQuestions) {
      await page.getByLabel(label).fill(longest);
    }
    for (const question of justifications.questions) {
      await answer(page, question, 'Yes').check();
      await details(page, question).fill(longest);
    }
    await continueForm(page);

    await expect(page).toHaveURL(taskListPath);
    await expect(taskRow(page, justifications.section.taskName)).toContainText('Completed');
  });
});
