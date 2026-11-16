// @vitest-environment jsdom
import type { CiMethod } from '@fphd/internal-api-features/contract';
import { serviceName } from '@fphd/ui';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, RELATED_GUIDANCE_LINK } from '../testing.ts';
import { ConfidenceIntervalsPage } from './page.tsx';

afterEach(() => {
  cleanup();
  // The server-rendered cases write the body directly, which cleanup does not know about.
  document.body.innerHTML = '';
});

const BYARS: CiMethod = {
  id: '019fa38f-073f-764e-9ac6-1c4d03b1cb92',
  name: "Byar's method",
  description: "Byar's method gives very accurate confidence intervals for counts.",
  kind: 'standard',
};
const CHIANG: CiMethod = {
  id: '019fa38f-0743-7fac-b512-96bed360f0bc',
  name: 'Chiang-Silcocks method',
  description: null,
  kind: 'standard',
};
const NONE_AVAILABLE: CiMethod = {
  id: '019fa38f-0748-74b5-83b2-f5dfebffaf22',
  name: 'No confidence intervals available',
  description: null,
  kind: 'none',
};
const OTHER: CiMethod = {
  id: '019fa38f-0746-7e1c-8826-0ee5d2b83fef',
  name: 'Other method',
  description: null,
  kind: 'other',
};
const UNKNOWN: CiMethod = {
  id: '019fa38f-0747-73bb-b8a4-bb6e8f3c244e',
  name: 'Unknown',
  description: null,
  kind: 'none',
};

const methods = [BYARS, CHIANG, NONE_AVAILABLE, OTHER, UNKNOWN];

const empty = {
  ciMethodId: '',
  hasCiMethodModifications: '',
  ciMethodModificationsDetail: '',
  ciMethodDetail: '',
};

const METHOD = 'Select the confidence interval method used';
const MODIFIED = 'Were any modifications to the described method used for this indicator?';
const MODIFICATIONS = 'Enter description of the modifications used';
const OTHER_DETAIL = 'Provide detail of the other confidence interval method used';

type Props = Parameters<typeof ConfidenceIntervalsPage>[0];

function page(props: Partial<Props>) {
  // The error summary's links read router state, so the page renders inside a router.
  return (
    <MemoryRouter>
      <ConfidenceIntervalsPage {...noRefusal} methods={methods} values={empty} {...props} />
    </MemoryRouter>
  );
}

/** Rendered and hydrated, as a browser running JavaScript has it. */
function renderPage(props: Partial<Props> = {}) {
  return render(page(props));
}

/** The server's HTML alone, as a browser without JavaScript has it. */
function renderWithoutJavaScript(props: Partial<Props> = {}) {
  document.body.innerHTML = renderToString(page(props));
}

function methodSelect() {
  return screen.getByLabelText(METHOD) as HTMLSelectElement;
}

function choose(method: CiMethod) {
  fireEvent.change(methodSelect(), { target: { value: method.id } });
}

function shown(element: HTMLElement) {
  return element.closest('[hidden]') === null;
}

// Found even when hidden, which the role query otherwise skips.
function modifiedQuestion() {
  return screen.getByRole('group', { name: MODIFIED, hidden: true });
}

function otherDetail() {
  return screen.getByLabelText(OTHER_DETAIL) as HTMLTextAreaElement;
}

describe('ConfidenceIntervalsPage', () => {
  it('links to its part of the publisher guidance', () => {
    renderPage();

    expect(screen.getByRole('link', { name: RELATED_GUIDANCE_LINK }).getAttribute('href')).toBe(
      '/publish/guidance#other-or-modified-ci-method',
    );
  });

  it('offers every method under the section heading, after an empty choice', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Confidence intervals' })).toBeTruthy();
    expect(methodSelect().getAttribute('name')).toBe('ciMethodId');
    expect([...methodSelect().options].map((option) => [option.value, option.text])).toEqual([
      ['', 'Select'],
      ...methods.map(({ id, name }) => [id, name]),
    ]);
  });

  describe('with JavaScript', () => {
    it('asks nothing more until a method is chosen', () => {
      renderPage();

      expect(shown(modifiedQuestion())).toBe(false);
      expect(shown(otherDetail())).toBe(false);
    });

    it("shows a standard method's description and asks whether it was modified", () => {
      renderPage();

      choose(BYARS);

      expect(screen.getByRole('heading', { level: 2, name: 'Standard description' })).toBeTruthy();
      expect(screen.getByText(BYARS.description ?? '')).toBeTruthy();
      expect(shown(modifiedQuestion())).toBe(true);
      expect(shown(otherDetail())).toBe(false);
    });

    it('asks whether a standard method with no description yet was modified', () => {
      renderPage();

      choose(CHIANG);

      expect(screen.queryByRole('heading', { name: 'Standard description' })).toBeNull();
      expect(shown(modifiedQuestion())).toBe(true);
    });

    it('asks for the detail of an other method alone', () => {
      renderPage();

      choose(OTHER);

      expect(shown(otherDetail())).toBe(true);
      expect(shown(modifiedQuestion())).toBe(false);
    });

    it.each([NONE_AVAILABLE, UNKNOWN])('asks nothing more of $name', (method) => {
      renderPage();

      choose(method);

      expect(shown(modifiedQuestion())).toBe(false);
      expect(shown(otherDetail())).toBe(false);
    });

    it('describes the method chosen, following each change of choice', () => {
      renderPage({ values: { ...empty, ciMethodId: BYARS.id } });

      expect(screen.getByText(BYARS.description ?? '')).toBeTruthy();

      choose(OTHER);

      expect(screen.queryByText(BYARS.description ?? '')).toBeNull();
    });

    it('follows a method chosen before the page was hydrated', () => {
      const container = document.createElement('div');
      container.innerHTML = renderToString(page({}));
      document.body.append(container);
      const select = container.querySelector('select');
      if (select === null) throw new Error('no select');
      select.value = OTHER.id;

      render(page({}), { container, hydrate: true });

      expect(shown(otherDetail())).toBe(true);
      expect(shown(modifiedQuestion())).toBe(false);
    });

    it('drops the hints that name the methods each question is for', () => {
      renderPage();

      expect(screen.queryByText(/Not needed for/)).toBeNull();
      expect(screen.queryByText(/Only needed for/)).toBeNull();
    });

    it('asks about modifications under a medium heading', () => {
      renderPage();

      const legend = within(modifiedQuestion()).getByRole('heading', {
        level: 2,
        name: MODIFIED,
        hidden: true,
      });

      expect(legend.parentElement?.className).toContain('govuk-fieldset__legend--m');
    });

    it('reveals the description of the modifications under Yes', () => {
      renderPage({ values: { ...empty, ciMethodId: BYARS.id } });

      const modifications = screen.getByLabelText(MODIFICATIONS);
      const conditional = modifications.closest('.govuk-radios__conditional');

      expect(conditional?.className).toContain('govuk-radios__conditional--hidden');

      fireEvent.click(screen.getByLabelText('Yes'));

      expect(conditional?.className).not.toContain('govuk-radios__conditional--hidden');
    });
  });

  describe('without JavaScript', () => {
    it('shows every follow-up, hinting at the methods each is for', () => {
      renderWithoutJavaScript();

      expect(shown(modifiedQuestion())).toBe(true);
      expect(shown(otherDetail())).toBe(true);
      expect(
        within(modifiedQuestion()).getByText(
          'Not needed for No confidence intervals available, Other method or Unknown',
        ),
      ).toBeTruthy();
      expect(screen.getByText('Only needed for Other method')).toBeTruthy();
    });

    it('describes the standard method it was given', () => {
      renderWithoutJavaScript({ values: { ...empty, ciMethodId: BYARS.id } });

      expect(screen.getByText(BYARS.description ?? '')).toBeTruthy();
    });

    it('describes no method when the one it was given is not standard', () => {
      renderWithoutJavaScript({ values: { ...empty, ciMethodId: OTHER.id } });

      expect(screen.queryByRole('heading', { name: 'Standard description' })).toBeNull();
    });
  });

  it('shows the answers it is given, so a draft can be revisited', () => {
    renderPage({
      values: {
        ciMethodId: BYARS.id,
        hasCiMethodModifications: 'yes',
        ciMethodModificationsDetail: 'Adjusted for clustering',
        ciMethodDetail: '',
      },
    });

    expect(methodSelect().value).toBe(BYARS.id);
    expect((screen.getByLabelText('Yes') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(MODIFICATIONS) as HTMLTextAreaElement).value).toBe(
      'Adjusted for clustering',
    );
    expect(document.title).toBe(`Confidence intervals - ${serviceName} - GOV.UK`);
  });

  it('links each refusal to its field, in the order the form asks', () => {
    renderPage({
      values: { ...empty, ciMethodId: BYARS.id },
      fieldErrors: {
        hasCiMethodModifications: 'Select whether any modifications were used',
        ciMethodId: 'Select the confidence interval method used',
      },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Select the confidence interval method used',
      'Select whether any modifications were used',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `#${methodSelect().id}`,
      `#${screen.getByLabelText('Yes').id}`,
    ]);
  });

  it('marks a refused follow-up and keeps what was typed', () => {
    const { container } = renderPage({
      values: { ...empty, ciMethodId: OTHER.id, ciMethodModificationsDetail: 'Kept' },
      fieldErrors: {
        ciMethodDetail: 'Enter details of the other confidence interval method used',
      },
    });

    const error = container.querySelector('.govuk-error-message');

    expect(shown(otherDetail())).toBe(true);
    expect(otherDetail().className).toContain('govuk-textarea--error');
    expect(otherDetail().getAttribute('aria-describedby')).toBe(error?.id);
    expect((screen.getByLabelText(MODIFICATIONS) as HTMLTextAreaElement).value).toBe('Kept');
    expect(container.querySelectorAll('.govuk-form-group--error')).toHaveLength(1);
  });
});
