// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import type { IndicatorDetail } from './loader.ts';
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

function renderBackground(detail: IndicatorDetail) {
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
              subtopics: [
                {
                  slug: 'prevalence-and-risk',
                  title: 'Prevalence and risk',
                  isPrimary: true,
                },
              ],
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
  function renderSummary(detail: IndicatorDetail) {
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
