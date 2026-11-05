// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { publishingDateControlNames } from '../publishing-date-form.ts';
import { noRefusal } from '../testing.ts';
import { PublishingDatePage } from './page.tsx';

afterEach(cleanup);

const TITLE = 'When should this indicator be published?';

const values = {
  publishingDateDay: '14',
  publishingDateMonth: '9',
  publishingDateYear: '2027',
  publishingTimeHour: '09',
  publishingTimeMinute: '30',
};

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof PublishingDatePage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PublishingDatePage {...noRefusal} dateExample="12 11 2027" values={values} {...props} />
    </MemoryRouter>,
  );
}

function input(group: string, label: string) {
  return within(screen.getByRole('group', { name: group })).getByLabelText(
    label,
  ) as HTMLInputElement;
}

function marked(container: HTMLElement) {
  return [...container.querySelectorAll('.govuk-input--error')].map(
    (element) => (element as HTMLInputElement).name,
  );
}

describe('PublishingDatePage', () => {
  it('asks for a date and a time under the page heading', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Date' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Time' })).toBeTruthy();
    expect(screen.getByText('For example, 12 11 2027')).toBeTruthy();
    expect(screen.getByText(/This will be 09:30 local UK time by default/)).toBeTruthy();
    expect(document.title).toBe(`${TITLE} - ${serviceName} - GOV.UK`);
  });

  it('posts each part under the name the action reads it by', () => {
    renderPage();

    expect(
      [
        input('Date', 'Day'),
        input('Date', 'Month'),
        input('Date', 'Year'),
        input('Time', 'Hour'),
        input('Time', 'Minute'),
      ].map(({ name, inputMode }) => [name, inputMode]),
    ).toEqual(Object.values(publishingDateControlNames).map((name) => [name, 'numeric']));
  });

  it('shows the date and time it is given, so a draft can be revisited', () => {
    renderPage();

    expect(
      ['Day', 'Month', 'Year']
        .map((label) => input('Date', label).value)
        .concat(['Hour', 'Minute'].map((label) => input('Time', label).value)),
    ).toEqual(['14', '9', '2027', '09', '30']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('summarises a message on several parts once, linking to the first, and marks those parts', () => {
    const message = 'Publishing date must include a day and month';
    const { container } = renderPage({
      fieldErrors: { publishingDateDay: message, publishingDateMonth: message },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      [message, `#${input('Date', 'Day').id}`],
    ]);
    expect(marked(container)).toEqual(['publishingDate[day]', 'publishingDate[month]']);
    expect(within(screen.getByRole('group', { name: 'Date' })).getByText(message)).toBeTruthy();
  });

  it('shows a refusal of the time on the time, marking only its refused part', () => {
    const { container } = renderPage({
      fieldErrors: { publishingTimeMinute: 'Publishing time must be a real time' },
    });
    const time = screen.getByRole('group', { name: 'Time' });
    const error = container.querySelector('.govuk-error-message');

    expect(within(time).getByText('Publishing time must be a real time')).toBeTruthy();
    expect(time.getAttribute('aria-describedby')).toContain(error?.id);
    expect(marked(container)).toEqual(['publishingTime[minute]']);
    expect(container.querySelectorAll('.govuk-form-group--error')).toHaveLength(1);
  });
});
