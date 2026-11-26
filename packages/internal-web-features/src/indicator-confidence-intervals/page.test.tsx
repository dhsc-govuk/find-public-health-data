// @vitest-environment jsdom
import type { CiMethod } from '@fphd/internal-api-features/contract';
import { serviceName } from '@fphd/ui';
import {
  CONFIDENCE_INTERVAL_DESCRIPTION,
  STANDARD_CONFIDENCE_INTERVAL_METHODS,
} from '@fphd/utils/standard-methods';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { noRefusal, RELATED_GUIDANCE_LINK } from '../testing.ts';
import { ConfidenceIntervalsPage, METHOD_NOT_OFFERED_LABEL } from './page.tsx';

afterEach(() => {
  cleanup();
  // The server-rendered cases write the body directly, which cleanup does not know about.
  document.body.innerHTML = '';
});

const BYARS: CiMethod = {
  id: '019fa38f-073f-764e-9ac6-1c4d03b1cb92',
  name: "Byar's method",
  kind: 'standard',
};
const NONE_AVAILABLE: CiMethod = {
  id: '019fa38f-0748-74b5-83b2-f5dfebffaf22',
  name: 'No confidence intervals available',
  kind: 'none',
};
const OTHER: CiMethod = {
  id: '019fa38f-0746-7e1c-8826-0ee5d2b83fef',
  name: 'Other method',
  kind: 'other',
};
const T_DISTRIBUTION: CiMethod = {
  id: '019fa38f-0744-72c8-811f-f7cb59dc5ad0',
  name: 'T-distribution method',
  kind: 'standard',
};

const methods = [BYARS, NONE_AVAILABLE, OTHER, T_DISTRIBUTION];

/** A method's own description from the shared standard methods. */
function descriptionOf({ name }: CiMethod): string {
  const description = STANDARD_CONFIDENCE_INTERVAL_METHODS.find(
    (method) => method.name === name,
  )?.description;
  if (description == null) throw new Error(`no standard description for ${name}`);
  return description;
}

const DESCRIPTION_HEADING = 'Standard method description';
const NOT_OFFERED_ID = '019fa38f-0747-73bb-b8a4-bb6e8f3c244e';

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

    it("shows what a confidence interval is and the standard method's description, then asks whether it was modified", () => {
      renderPage();

      choose(BYARS);

      expect(screen.getByRole('heading', { level: 2, name: DESCRIPTION_HEADING })).toBeTruthy();
      expect(screen.getByText(CONFIDENCE_INTERVAL_DESCRIPTION)).toBeTruthy();
      expect(screen.getByText(descriptionOf(BYARS))).toBeTruthy();
      expect(shown(modifiedQuestion())).toBe(true);
      expect(shown(otherDetail())).toBe(false);
    });

    it('shows what a confidence interval is alone for a standard method with no description yet, and asks whether it was modified', () => {
      const { container } = renderPage();

      choose(T_DISTRIBUTION);

      expect(screen.getByRole('heading', { level: 2, name: DESCRIPTION_HEADING })).toBeTruthy();
      const description = screen.getByText(CONFIDENCE_INTERVAL_DESCRIPTION);
      expect(description.nextElementSibling?.tagName).not.toBe('P');
      expect(container.textContent).not.toContain('[Method explanation needed]');
      expect(shown(modifiedQuestion())).toBe(true);
    });

    it('explains having no confidence intervals, asking nothing more', () => {
      renderPage();

      choose(NONE_AVAILABLE);

      expect(screen.getByRole('heading', { level: 2, name: DESCRIPTION_HEADING })).toBeTruthy();
      expect(screen.getByText(descriptionOf(NONE_AVAILABLE))).toBeTruthy();
      expect(screen.queryByText(CONFIDENCE_INTERVAL_DESCRIPTION)).toBeNull();
      expect(shown(modifiedQuestion())).toBe(false);
      expect(shown(otherDetail())).toBe(false);
    });

    it('asks for the detail of an other method alone', () => {
      renderPage();

      choose(OTHER);

      expect(shown(otherDetail())).toBe(true);
      expect(shown(modifiedQuestion())).toBe(false);
      expect(screen.queryByRole('heading', { name: DESCRIPTION_HEADING })).toBeNull();
    });

    it('describes the method chosen, following each change of choice', () => {
      renderPage({ values: { ...empty, ciMethodId: BYARS.id } });

      expect(screen.getByText(descriptionOf(BYARS))).toBeTruthy();

      choose(OTHER);

      expect(screen.queryByText(descriptionOf(BYARS))).toBeNull();
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
          'Not needed for No confidence intervals available or Other method',
        ),
      ).toBeTruthy();
      expect(screen.getByText('Only needed for Other method')).toBeTruthy();
    });

    it('describes the standard method it was given', () => {
      renderWithoutJavaScript({ values: { ...empty, ciMethodId: BYARS.id } });

      expect(screen.getByText(descriptionOf(BYARS))).toBeTruthy();
    });

    it('describes no method when the one it was given is an other method', () => {
      renderWithoutJavaScript({ values: { ...empty, ciMethodId: OTHER.id } });

      expect(screen.queryByRole('heading', { name: DESCRIPTION_HEADING })).toBeNull();
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
        hasCiMethodModifications:
          'Select whether any modifications to the described method were used',
        ciMethodId: 'Select the confidence interval method used',
      },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual([
      'Select the confidence interval method used',
      'Select whether any modifications to the described method were used',
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
        ciMethodDetail: 'Enter details of the other confidence interval method',
      },
    });

    const error = container.querySelector('.govuk-error-message');

    expect(shown(otherDetail())).toBe(true);
    expect(otherDetail().className).toContain('govuk-textarea--error');
    expect(otherDetail().getAttribute('aria-describedby')).toBe(error?.id);
    expect((screen.getByLabelText(MODIFICATIONS) as HTMLTextAreaElement).value).toBe('Kept');
    expect(container.querySelectorAll('.govuk-form-group--error')).toHaveLength(1);
  });

  it('shows a saved method the list no longer offers as chosen, with its error', () => {
    renderPage({
      values: { ...empty, ciMethodId: NOT_OFFERED_ID },
      fieldErrors: {
        ciMethodId:
          'The confidence interval method saved is no longer available. Select another method',
      },
    });

    expect(methodSelect().value).toBe(NOT_OFFERED_ID);
    expect(methodSelect().selectedOptions[0]?.text).toBe(METHOD_NOT_OFFERED_LABEL);
    expect(
      within(screen.getByRole('alert')).getByRole('link', {
        name: 'The confidence interval method saved is no longer available. Select another method',
      }),
    ).toBeTruthy();
    expect(shown(modifiedQuestion())).toBe(false);
    expect(shown(otherDetail())).toBe(false);
  });

  it('offers no stand-in when the saved method is one the list offers', () => {
    renderPage({ values: { ...empty, ciMethodId: BYARS.id } });

    expect([...methodSelect().options].map(({ text }) => text)).not.toContain(
      METHOD_NOT_OFFERED_LABEL,
    );
  });
});
