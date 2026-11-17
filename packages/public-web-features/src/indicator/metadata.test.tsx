// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import type { IndicatorDetail, IndicatorPageDetail } from './loader.ts';
import { BackgroundInformation, IndicatorSummary } from './metadata.tsx';

afterEach(cleanup);

const indicator: IndicatorDetail = {
  shortId: 108,
  slug: 'an-indicator',
  name: 'An indicator',
  valueType: 'Proportion',
  unit: '%',
  yearType: { value: 'calendar', label: 'Calendar' },
  updateFrequency: 'annually',
  updateFrequencyReason: null,
  updateFrequencyText: null,
  polarity: 'lower-is-better',
  ciMethod: null,
  ciConfidenceLevel: null,
  comparatorMethod: null,
  dataUpdatedAt: null,
  firstPublishedAt: '2026-04-20T00:00:00.000Z',
  lastPublishedAt: '2026-04-20T00:00:00.000Z',
  definition: null,
  rationale: null,
  methodology: null,
  numeratorDefinition: 'Deaths',
  denominatorDefinition: null,
  disclosureControl: null,
  caveats: null,
  notes: null,
  dataSource: null,
  numeratorSources: [
    { provider: 'Office for National Statistics (ONS)', source: 'Annual mortality extract' },
    { provider: 'NHS England (NHSE)', source: null },
  ],
  denominatorSources: [],
  areaTypes: [],
  topics: [],
  classifications: [],
  updateSummaries: [],
};

function renderBackground(detail: IndicatorPageDetail) {
  render(
    <MemoryRouter>
      <BackgroundInformation indicator={detail} />
    </MemoryRouter>,
  );
}

function attributeNames() {
  return screen.getAllByRole('term').map((term) => term.textContent);
}

it('links each subtopic to the filtered topic data page', () => {
  render(
    <MemoryRouter>
      <IndicatorSummary
        observations={[]}
        indicator={{
          ...indicator,
          topics: [
            {
              slug: 'diabetes',
              title: 'Diabetes',
              subtopics: [{ slug: 'prevalence-and-risk', title: 'Prevalence and risk' }],
            },
          ],
        }}
      />
    </MemoryRouter>,
  );
  expect(screen.getByText('Subtopic')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Prevalence and risk' }).getAttribute('href')).toBe(
    '/topics/diabetes?tab-topic=data&subtopic=prevalence-and-risk',
  );
});

describe('IndicatorSummary', () => {
  function renderSummary(detail: IndicatorPageDetail) {
    render(
      <MemoryRouter>
        <IndicatorSummary indicator={detail} observations={[]} />
      </MemoryRouter>,
    );
  }

  function summaryRow(name: string) {
    const term = screen.getAllByRole('term').find((entry) => entry.textContent === name);

    return term?.nextElementSibling?.textContent;
  }

  it('reads Updated once a later version has been published', () => {
    renderSummary({ ...indicator, lastPublishedAt: '2026-09-01T09:00:00.000Z' });

    expect(summaryRow('Status')).toBe('Updated');
  });

  it('gives no status to an indicator published once, though its data has a date', () => {
    renderSummary({ ...indicator, dataUpdatedAt: '2026-04-20T00:00:00.000Z' });

    expect(summaryRow('Status')).toBeUndefined();
    expect(summaryRow('Last updated')).toBe('20 April 2026');
  });

  it('gives the update frequency as its label when it has no reason', () => {
    renderSummary(indicator);

    expect(summaryRow('Update frequency')).toBe('Annually');
  });

  it('leaves out the update frequency of an indicator imported without one', () => {
    renderSummary({ ...indicator, updateFrequency: null });

    expect(summaryRow('Update frequency')).toBeUndefined();
  });

  it.each([
    ['no-fixed-frequency', 'No fixed frequency, for the following reason:'],
    ['no-longer-updated', 'This indicator will no longer be updated for the following reason:'],
  ] as const)('introduces the reason for %s and shows it below', (updateFrequency, text) => {
    renderSummary({
      ...indicator,
      updateFrequency,
      updateFrequencyReason: 'The survey ended in 2024.\nNo replacement is planned.',
    });

    expect(summaryRow('Update frequency')).toBe(
      `${text}The survey ended in 2024.\nNo replacement is planned.`,
    );
    expect(screen.getByText(/^The survey ended in 2024\./).className).toContain(
      'fphd-metadata-text',
    );
  });

  it('gives the label alone for an indicator imported with no fixed frequency and no reason', () => {
    renderSummary({ ...indicator, updateFrequency: 'no-fixed-frequency' });

    expect(summaryRow('Update frequency')).toBe('No fixed frequency');
  });
});

describe('BackgroundInformation', () => {
  it('lists each numerator source, naming a provider alone where it has no specific source', () => {
    renderBackground(indicator);

    const sources = within(screen.getByRole('list')).getAllByRole('listitem');

    expect(sources.map((item) => item.textContent)).toEqual([
      'Office for National Statistics (ONS): Annual mortality extract',
      'NHS England (NHSE)',
    ]);
  });

  it('leaves out a part with neither sources nor a definition', () => {
    renderBackground(indicator);

    expect(screen.getByRole('heading', { name: 'Numerator' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Denominator' })).toBeNull();
  });

  it('lists the value type and unit among the data attributes', () => {
    renderBackground(indicator);

    expect(attributeNames()).toEqual(expect.arrayContaining(['Value type', 'Unit']));
    expect(screen.getByText('%')).toBeTruthy();
  });

  it('lists no frequency for an indicator imported without one', () => {
    renderBackground({ ...indicator, updateFrequency: null });

    expect(attributeNames()).not.toContain('Frequency');
    expect(attributeNames()).toContain('Polarity');
  });

  it('lists no unit for values that have none', () => {
    renderBackground({ ...indicator, unit: null });

    expect(attributeNames()).toContain('Value type');
    expect(attributeNames()).not.toContain('Unit');
  });

  it('lists the year type', () => {
    renderBackground(indicator);

    expect(attributeNames()).toContain('Year type');
    expect(screen.getByText('Calendar')).toBeTruthy();
  });

  it('lists the frequency with the reason the publisher gave', () => {
    renderBackground({
      ...indicator,
      updateFrequency: 'no-fixed-frequency',
      updateFrequencyReason: 'Published when the survey runs.',
    });

    const frequency = screen
      .getAllByRole('term')
      .find((term) => term.textContent === 'Frequency')?.nextElementSibling;

    expect(frequency?.textContent).toBe(
      'No fixed frequency, for the following reason:Published when the survey runs.',
    );
  });

  it('lists no year type for an indicator of months, which has none', () => {
    renderBackground({ ...indicator, yearType: null });

    expect(attributeNames()).toContain('Value type');
    expect(attributeNames()).not.toContain('Year type');
  });

  it('lists the update summaries under History, each beside the date its update went live', () => {
    renderBackground({
      ...indicator,
      updateSummaries: [
        { publishedAt: '2027-01-20T09:30:00.000Z', summary: 'Renamed the indicator.' },
        { publishedAt: '2026-11-02T09:30:00.000Z', summary: 'Added 2025 data.\nFixed a typo.' },
      ],
    });

    const history = screen.getByRole('heading', { name: 'History' }).nextElementSibling;

    expect(history).not.toBeNull();
    const rows = within(history as HTMLElement).getAllByRole('term');
    expect(rows.map((term) => [term.textContent, term.nextElementSibling?.textContent])).toEqual([
      ['20 January 2027', 'Renamed the indicator.'],
      ['2 November 2026', 'Added 2025 data.\nFixed a typo.'],
    ]);
  });

  it('has no History for an indicator with no update summaries', () => {
    renderBackground(indicator);

    expect(screen.queryByRole('heading', { name: 'History' })).toBeNull();
  });
});

describe.each(['summary', 'background'] as const)('%s update frequency text', (surface) => {
  const updateFrequencyText = 'Annual measurements during the academic year.\nPublished in winter.';

  function frequencyRow(detail: IndicatorDetail) {
    render(
      <MemoryRouter>
        {surface === 'summary' ? (
          <IndicatorSummary indicator={detail} observations={[]} />
        ) : (
          <BackgroundInformation indicator={detail} />
        )}
      </MemoryRouter>,
    );
    const name = surface === 'summary' ? 'Update frequency' : 'Frequency';

    return screen.getAllByRole('term').find((term) => term.textContent === name)
      ?.nextElementSibling;
  }

  it.each(['annually', 'no-fixed-frequency', null] as const)(
    'shows the original text in place of %s when there is no reason',
    (updateFrequency) => {
      const row = frequencyRow({
        ...indicator,
        updateFrequency,
        updateFrequencyReason: null,
        updateFrequencyText,
      });

      expect(row?.textContent).toBe(updateFrequencyText);
      expect(row?.querySelector('.fphd-metadata-text')?.textContent).toBe(updateFrequencyText);
    },
  );

  it('keeps the reason the publisher gave after the original text', () => {
    const row = frequencyRow({
      ...indicator,
      updateFrequency: 'no-longer-updated',
      updateFrequencyReason: 'The survey has ended.',
      updateFrequencyText,
    });

    expect(row?.textContent).toBe(
      `${updateFrequencyText}This indicator will no longer be updated for the following reason:The survey has ended.`,
    );
    expect(
      [...(row?.querySelectorAll('.fphd-metadata-text') ?? [])].map((part) => part.textContent),
    ).toEqual([updateFrequencyText, 'The survey has ended.']);
  });
});

describe('placeholders', () => {
  function row(name: string) {
    const term = screen.getAllByRole('term').find((entry) => entry.textContent === name);

    return term?.nextElementSibling?.textContent;
  }

  function renderSummary(detail: IndicatorPageDetail) {
    render(
      <MemoryRouter>
        <IndicatorSummary indicator={detail} observations={[]} />
      </MemoryRouter>,
    );
  }

  const unanswered: IndicatorPageDetail = {
    ...indicator,
    valueType: null,
    unit: null,
    polarity: null,
    updateFrequency: null,
    unanswered: ['valueType', 'unit', 'polarity', 'updateFrequency'],
    dataState: 'ready',
  };

  it("reads [Not entered yet] for each data attribute a preview's draft hasn't answered", () => {
    renderBackground(unanswered);

    for (const name of ['Value type', 'Unit', 'Frequency', 'Polarity']) {
      expect(row(name)).toBe('[Not entered yet]');
    }
  });

  it("reads [Not entered yet] for an update frequency a preview's draft hasn't answered", () => {
    renderSummary(unanswered);

    expect(row('Update frequency')).toBe('[Not entered yet]');
  });

  it('shows answers the unanswered list does not name as the public page would', () => {
    renderBackground({ ...indicator, unit: null, unanswered: ['valueType'], dataState: 'ready' });

    expect(attributeNames()).not.toContain('Unit');
    expect(row('Value type')).toBe('[Not entered yet]');
    expect(row('Polarity')).toBe('Lower is better');
  });

  it.each([
    ['no-upload', '[Not provided yet]'],
    ['read-models-missing', "[Data isn't shown in the preview yet]"],
  ] as const)('reads %s data as %s where the page needs data', (dataState, text) => {
    renderSummary({ ...indicator, dataState });

    expect(row('Period covered')).toBe(text);
    expect(row('Trend (last 5 periods)')).toBe(text);

    cleanup();
    renderBackground({ ...indicator, dataState });

    expect(row('Ages')).toBe(text);
    expect(row('Sex')).toBe(text);
  });

  it('never shows a placeholder for the public detail, even with no data', () => {
    renderSummary(indicator);

    expect(row('Period covered')).toBe('No data');
    expect(screen.queryByText(/\[Not/)).toBeNull();

    cleanup();
    renderBackground({ ...indicator, unit: null, updateFrequency: null });

    expect(screen.queryByText(/\[Not/)).toBeNull();
    expect(attributeNames()).not.toContain('Ages');
  });
});
