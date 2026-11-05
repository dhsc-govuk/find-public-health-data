// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { PublicationDatePage } from './page.tsx';

afterEach(cleanup);

const TITLE = 'Confirm publication date';
const SHOWN = '2027-04-01T08:30:00.000Z';

const values = {
  publishingDateDay: '1',
  publishingDateMonth: '4',
  publishingDateYear: '2027',
  publishingTimeHour: '09',
  publishingTimeMinute: '30',
};

function renderPage(props: Partial<Parameters<typeof PublicationDatePage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PublicationDatePage
        fieldErrors={{}}
        formError={undefined}
        shownScheduledPublishAt={SHOWN}
        values={values}
        {...props}
      />
    </MemoryRouter>,
  );
}

function input(group: string, label: string) {
  return within(screen.getByRole('group', { name: group })).getByLabelText(
    label,
  ) as HTMLInputElement;
}

describe('PublicationDatePage', () => {
  it('asks for the date and time under its heading, with a Submit button', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
    expect(screen.getByText('Use numbers only in the format DD MM YYYY.')).toBeTruthy();
    expect(screen.getByText(/This will be 09:30 local UK time by default/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeTruthy();
    expect(document.title).toBe(`${TITLE} - ${serviceName} - GOV.UK`);
  });

  it('fills in the date and time the indicator has, and sends back the date it showed', () => {
    const { container } = renderPage();

    expect(
      ['Day', 'Month', 'Year']
        .map((label) => input('Date', label).value)
        .concat(['Hour', 'Minute'].map((label) => input('Time', label).value)),
    ).toEqual(['1', '4', '2027', '09', '30']);
    expect(
      (container.querySelector('input[name="shownScheduledPublishAt"]') as HTMLInputElement).value,
    ).toBe(SHOWN);
  });

  it('summarises a date in the past once, marking the date and starting the title with "Error: "', () => {
    const message = 'Publishing date and time must be in the future';
    renderPage({
      fieldErrors: {
        publishingDateDay: message,
        publishingDateMonth: message,
        publishingDateYear: message,
      },
    });

    const links = within(screen.getByRole('alert')).getAllByRole('link');

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      [message, `#${input('Date', 'Day').id}`],
    ]);
    expect(within(screen.getByRole('group', { name: 'Date' })).getByText(message)).toBeTruthy();
    expect(document.title).toBe(`Error: ${TITLE} - ${serviceName} - GOV.UK`);
  });
});
