// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { TopicMoreInformation } from './more-information.tsx';

afterEach(cleanup);

const OHID_LINK = 'Release calendar for the Office for Health Improvement and Disparities';

it('links to the OHID release calendar on GOV.UK for a topic without curated content', () => {
  render(<TopicMoreInformation content={null} />);
  expect(
    screen.getByText(
      'Find upcoming official statistics releases about public health data on GOV.UK.',
    ),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: OHID_LINK }).getAttribute('href')).toBe(
    'https://www.gov.uk/search/research-and-statistics?content_store_document_type=upcoming_statistics&organisations[]=office-for-health-improvement-and-disparities&order=release-date-oldest',
  );
  expect(screen.queryByText('No further information is available for this topic.')).toBeNull();
});

it('shows curated sections in place of the OHID statistics link', () => {
  render(
    <TopicMoreInformation
      content={{
        overviewIntro: 'About the topic',
        highlightedIndicatorIds: [],
        highlightIntro: 'Highlighted indicators give headline information about:',
        highlightPoints: [],
        moreInformation: {
          intro: 'Find official statistics releases about this topic.',
          sections: [
            {
              heading: 'Official statistics releases on GOV.UK',
              links: [
                {
                  label: 'Topic release',
                  url: 'https://www.gov.uk/government/statistics/topic-release',
                  note: 'May 2026',
                },
              ],
            },
          ],
        },
      }}
    />,
  );
  expect(screen.getByText('Find official statistics releases about this topic.')).toBeTruthy();
  expect(
    screen.getByRole('heading', { level: 2, name: 'Official statistics releases on GOV.UK' }),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Topic release' }).getAttribute('href')).toBe(
    'https://www.gov.uk/government/statistics/topic-release',
  );
  expect(screen.getByRole('listitem').textContent).toBe('Topic release (May 2026)');
  expect(screen.queryByRole('link', { name: OHID_LINK })).toBeNull();
});
