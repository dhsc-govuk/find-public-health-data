// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal } from '../testing.ts';
import { VarianceAndQualityPage } from './page.tsx';

afterEach(cleanup);

const empty = {
  variation: '',
  qualityAssurance: '',
  sourceDataIssuesDetail: '',
};

const VARIATION = 'How does the indicator vary?';
const QUALITY_ASSURANCE = 'What quality assurance has been done on the indicator?';
const IMPROVEMENTS =
  'If there are any data quality issues, what is being done to improve the quality? (Optional)';

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof VarianceAndQualityPage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <VarianceAndQualityPage {...noRefusal} values={empty} {...props} />
    </MemoryRouter>,
  );
}

function textarea(label: string) {
  return screen.getByLabelText(label) as HTMLTextAreaElement;
}

describe('VarianceAndQualityPage', () => {
  it('says under the heading that the answers are for reviewer use only', () => {
    renderPage();

    const heading = screen.getByRole('heading', { level: 1, name: 'Variance and quality' });
    expect(heading.nextElementSibling?.textContent).toBe(
      'The information you provide here is for reviewer use only',
    );
    expect(heading.nextElementSibling?.className).toContain('govuk-inset-text');
  });

  it('asks three questions in text, the last of them optional, and nothing else', () => {
    renderPage();

    expect(
      [textarea(VARIATION), textarea(QUALITY_ASSURANCE), textarea(IMPROVEMENTS)].map((field) => [
        field.name,
        field.getAttribute('rows'),
      ]),
    ).toEqual([
      ['variation', '5'],
      ['qualityAssurance', '5'],
      ['sourceDataIssuesDetail', '5'],
    ]);
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([VARIATION, QUALITY_ASSURANCE, IMPROVEMENTS]);
    expect(screen.queryAllByRole('radio')).toEqual([]);
  });

  it('shows the answers it is given, so a draft can be revisited', () => {
    renderPage({
      values: {
        variation: 'Varies by area.',
        qualityAssurance: 'Checked.',
        sourceDataIssuesDetail: 'Chasing late returns.',
      },
    });

    expect(textarea(VARIATION).value).toBe('Varies by area.');
    expect(textarea(QUALITY_ASSURANCE).value).toBe('Checked.');
    expect(textarea(IMPROVEMENTS).value).toBe('Chasing late returns.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.title).toBe(`Variance and quality - ${serviceName} - GOV.UK`);
  });

  it('links each refusal to its field, in the order the form asks', () => {
    renderPage({
      fieldErrors: {
        qualityAssurance: 'Enter what quality assurance has been done on the indicator',
        variation: 'Enter how the indicator varies',
      },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Enter how the indicator varies',
      'Enter what quality assurance has been done on the indicator',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `#${textarea(VARIATION).id}`,
      `#${textarea(QUALITY_ASSURANCE).id}`,
    ]);
    expect(textarea(VARIATION).className).toContain('govuk-textarea--error');
  });

  it('links a refusal of the improvement notes, such as their length, to their field', () => {
    renderPage({
      fieldErrors: {
        sourceDataIssuesDetail: 'Data quality improvement notes must be 10,000 characters or fewer',
      },
    });

    expect(within(screen.getByRole('alert')).getByRole('link').getAttribute('href')).toBe(
      `#${textarea(IMPROVEMENTS).id}`,
    );
  });
});
