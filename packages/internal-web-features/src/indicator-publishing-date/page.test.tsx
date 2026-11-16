// @vitest-environment jsdom
import { serviceName } from '@fphd/ui';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { publishingDateControlNames } from '../publishing-date-form.ts';
import { noRefusal, RELATED_GUIDANCE_LINK } from '../testing.ts';
import { PublishingDatePage } from './page.tsx';

afterEach(cleanup);

const TITLE = 'When should this indicator be published?';

const values = {
  publishingDateDay: '14',
  publishingDateMonth: '9',
  publishingDateYear: '2027',
  fastTracked: '',
  fastTrackReason: '',
  publishingTimeHour: '09',
  publishingTimeMinute: '30',
};

const FAST_TRACKED = 'This indicator needs to be fast-tracked';
const REASON = 'Enter reason for fast-tracking';

// The error summary's links read router state, so the page renders inside a router.
function renderPage(props: Partial<Parameters<typeof PublishingDatePage>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PublishingDatePage {...noRefusal} values={values} {...props} />
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
  it('links to its part of the publisher guidance', () => {
    renderPage();

    expect(screen.getByRole('link', { name: RELATED_GUIDANCE_LINK }).getAttribute('href')).toBe(
      '/publish/guidance#publishing-date',
    );
  });

  it('asks for a date and a time under the page heading', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Date' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Time' })).toBeTruthy();
    expect(
      screen.getByText(
        'This date must be at least 8 weeks from when you submit the indicator, to allow for IMRG review. Unless this indicator needs to be fast-tracked, but you will need to explain why. Use numbers only in the format DD MM YYYY.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/This will be 09:30 local UK time by default/)).toBeTruthy();
    expect(document.title).toBe(`${TITLE} - ${serviceName} - GOV.UK`);
  });

  it('asks when the update is published, for a draft of a live indicator', () => {
    renderPage({ isUpdate: true });

    const title = 'When should this update be published?';
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
    expect(document.title).toBe(`${title} - ${serviceName} - GOV.UK`);
    expect(
      screen.getByText(
        'This date must be at least 8 weeks from when you submit the update, to allow for possible IMRG review. Unless this update needs to be fast-tracked, but you will need to explain why. Use numbers only in the format DD MM YYYY.',
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('This update needs to be fast-tracked')).toBeTruthy();
  });

  it('asks whether the indicator needs to be fast-tracked between the date and the time', () => {
    const { container } = renderPage();
    const checkbox = screen.getByLabelText(FAST_TRACKED) as HTMLInputElement;
    const order = [
      screen.getByRole('group', { name: 'Date' }),
      checkbox,
      screen.getByRole('group', { name: 'Time' }),
    ];

    expect([checkbox.name, checkbox.value, checkbox.checked]).toEqual([
      'fastTracked',
      'yes',
      false,
    ]);
    expect(
      order.every(
        (element, index) =>
          index === 0 ||
          (order[index - 1] as Element).compareDocumentPosition(element) &
            Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(container.querySelector('.govuk-checkboxes__conditional--hidden')).not.toBeNull();
  });

  it('reveals the reason of a fast-tracked draft', () => {
    const { container } = renderPage({
      values: { ...values, fastTracked: 'yes', fastTrackReason: 'For a ministerial briefing.' },
    });
    const reason = screen.getByLabelText(REASON) as HTMLTextAreaElement;

    expect((screen.getByLabelText(FAST_TRACKED) as HTMLInputElement).checked).toBe(true);
    expect([reason.name, reason.value]).toEqual(['fastTrackReason', 'For a ministerial briefing.']);
    expect(container.querySelector('.govuk-checkboxes__conditional--hidden')).toBeNull();
  });

  it('links a missing reason from the error summary to its box', () => {
    renderPage({
      values: { ...values, fastTracked: 'yes' },
      fieldErrors: { fastTrackReason: 'Enter the reason for fast-tracking' },
    });

    const [link] = within(screen.getByRole('alert')).getAllByRole('link');

    expect(link?.getAttribute('href')).toBe(`#${screen.getByLabelText(REASON).id}`);
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
