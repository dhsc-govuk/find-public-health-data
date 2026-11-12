import { TEAM_IDS } from '@fphd/auth';
import {
  benchmarkingSection,
  calculationSection,
  confidenceIntervalsSection,
  copyrightAndDataReuseSection,
  DEFAULT_PUBLISHING_TIME,
  dataQualitySection,
  definitionAndRationaleSection,
  type IndicatorSectionFields,
  indicatorSectionFormValues,
  justificationsSection,
  otherCommentsSection,
  otherNotesAndCaveatsSection,
  periodTypeSection,
  polaritySection,
  publishingDateSection,
  updateFrequencySection,
  valueTypeAndUnitsSection,
  varianceAndQualitySection,
} from '@fphd/internal-api-features/contract';
import { createDocumentMeta, serviceName } from '@fphd/ui';
import type { ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { createRoutesStub, Meta, type MetaFunction, Outlet } from 'react-router';
import { describe, expect, it } from 'vitest';

import { FORM_NOT_SAVED } from './form-refusal.ts';
import * as benchmarking from './indicator-benchmarking/route.tsx';
import * as calculation from './indicator-calculation/route.tsx';
import * as confidenceIntervals from './indicator-confidence-intervals/route.tsx';
import * as copyrightAndDataReuse from './indicator-copyright-and-data-reuse/route.tsx';
import * as dataQuality from './indicator-data-quality/route.tsx';
import * as definitionAndRationale from './indicator-definition-and-rationale/route.tsx';
import * as justifications from './indicator-justifications/route.tsx';
import * as links from './indicator-links/route.tsx';
import * as editIndicatorName from './indicator-name/edit-route.tsx';
import * as newIndicator from './indicator-name/new-route.tsx';
import * as denominator from './indicator-numerator-denominator/denominator-route.tsx';
import * as numerator from './indicator-numerator-denominator/numerator-route.tsx';
import * as otherComments from './indicator-other-comments/route.tsx';
import * as otherNotesAndCaveats from './indicator-other-notes-and-caveats/route.tsx';
import * as overview from './indicator-overview/route.tsx';
import * as periodType from './indicator-period-type/route.tsx';
import * as polarity from './indicator-polarity/route.tsx';
import * as publishingDate from './indicator-publishing-date/route.tsx';
import * as sexAndAges from './indicator-sex-and-ages/route.tsx';
import * as tagging from './indicator-tagging/route.tsx';
import * as updateFrequency from './indicator-update-frequency/route.tsx';
import * as valueTypeAndUnits from './indicator-value-type-and-units/route.tsx';
import * as varianceAndQuality from './indicator-variance-and-quality/route.tsx';
import * as editTopic from './topic-admin/edit-route.tsx';
import * as newTopic from './topic-admin/new-route.tsx';

interface FormRoute {
  default: ComponentType;
  meta: MetaFunction;
  handle?: unknown;
}

const indicator = {
  id: '00000000-0000-7000-8000-000000000001',
  shortId: 90366,
  name: 'Life expectancy at birth',
  publishedSlug: null,
  updatedAt: '2026-01-02T00:00:00.000Z',
  indicatorStatus: 'new',
  draftStatus: 'draft',
};

const topic = {
  id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b',
  title: 'Smoking',
  slug: 'smoking',
  description: 'About smoking.',
};

/** A section's form with nothing answered, as its loader gives it for a new draft. */
function unanswered<Field extends string>(section: { fields: IndicatorSectionFields<Field> }) {
  return indicatorSectionFormValues(section.fields, {} as Record<Field, null>);
}

/** A page asking only its section's own fields, refused with `fieldErrors`. */
function sectionForm<Field extends string>(
  name: string,
  route: FormRoute,
  section: { fields: IndicatorSectionFields<Field> },
  pageTitle: string,
  fieldErrors: Partial<Record<Field, string>>,
  loaderData: object = {},
  values: Record<Field, string> = unanswered(section),
) {
  return {
    name,
    route,
    pageTitle,
    loaderData: { id: indicator.id, values, ...loaderData },
    rejected: { values, fieldErrors },
  };
}

const sexAndAgesUnanswered = {
  sexes: [],
  ageType: '',
  ageRanges: [{ lowerLimit: '', lowerLimitUnit: '', upperLimit: '', upperLimitUnit: '' }],
  specificAge: '',
  specificAgeUnit: '',
  ageDetail: '',
};

const taggingUnanswered = {
  topicIds: [],
  primaryTopicId: '',
  subtopicIds: [],
  primarySubtopicId: '',
  indicatorTypeIds: [],
  hasLifeStage: '',
  lifeStageIds: [],
  hasFramework: '',
  frameworkIds: [],
  addTopic: '',
  addSubtopic: '',
  addIndicatorType: '',
  addLifeStage: '',
  addFramework: '',
};

const tagOptions = {
  topics: [],
  subtopics: [],
  indicatorTypes: [],
  lifeStages: [],
  frameworks: [],
};

const linksUnanswered = { hasLinks: '', links: [], linkUrl: '', linkText: '' };

const providerSourcesUnanswered = { sources: [], definition: '', providerId: '', sourceId: '' };

const noteAdded = { reviewerNote: '', noteId: '', version: '' };

const forms: {
  name: string;
  route: FormRoute;
  pageTitle: string;
  loaderData?: unknown;
  rejected: unknown;
}[] = [
  {
    name: 'new indicator',
    route: newIndicator,
    pageTitle: 'What is the name of the indicator?',
    loaderData: { id: '019a1b2c-3d4e-7f60-8a9b-0c1d2e3f4a5b' },
    rejected: { values: { name: '' }, fieldErrors: { name: 'Enter the name of the indicator' } },
  },
  {
    name: 'indicator name',
    route: editIndicatorName,
    pageTitle: 'What is the name of the indicator?',
    loaderData: { indicator },
    rejected: { values: { name: '' }, fieldErrors: { name: 'Enter the name of the indicator' } },
  },
  sectionForm(
    'definition and rationale',
    definitionAndRationale,
    definitionAndRationaleSection,
    'Definition and rationale',
    { definition: 'Enter the definition of the indicator' },
  ),
  sectionForm('polarity', polarity, polaritySection, 'What is the polarity of this indicator?', {
    polarity: 'Select the polarity of this indicator',
  }),
  sectionForm(
    'data quality',
    dataQuality,
    dataQualitySection,
    'Are there any data quality issues with this indicator?',
    {
      hasDataQualityIssues: 'Select whether there are any data quality issues with this indicator',
    },
  ),
  sectionForm('calculation', calculation, calculationSection, 'How was the indicator calculated?', {
    methodology: 'Enter the methodology',
  }),
  sectionForm(
    'confidence intervals',
    confidenceIntervals,
    confidenceIntervalsSection,
    'Confidence intervals',
    { ciMethodId: 'Select the confidence interval method used' },
    { methods: [] },
  ),
  sectionForm(
    'update frequency',
    updateFrequency,
    updateFrequencySection,
    'How often will this indicator be updated?',
    { updateFrequency: 'Select how often this indicator will be updated' },
  ),
  sectionForm(
    'value type and units',
    valueTypeAndUnits,
    valueTypeAndUnitsSection,
    'What are the value type and units used in this indicator?',
    { valueTypeId: 'Select the value type' },
    { valueTypes: [], units: [] },
  ),
  sectionForm(
    'period type',
    periodType,
    periodTypeSection,
    'What is the period type in this indicator?',
    { periodType: 'Select the period type' },
  ),
  sectionForm(
    'other notes and caveats',
    otherNotesAndCaveats,
    otherNotesAndCaveatsSection,
    'Provide any other notes and caveats',
    { disclosureControl: 'Select whether disclosure control has been applied' },
  ),
  sectionForm(
    'publishing date',
    publishingDate,
    publishingDateSection,
    'When should this indicator be published?',
    { publishingDateDay: 'Enter the publishing date' },
    { dateExample: '9 11 2027' },
    { ...unanswered(publishingDateSection), ...DEFAULT_PUBLISHING_TIME },
  ),
  {
    name: 'links',
    route: links,
    pageTitle: 'Are there any relevant links to help users understand this indicator better?',
    loaderData: { id: indicator.id, values: linksUnanswered },
    rejected: {
      values: linksUnanswered,
      fieldErrors: { hasLinks: 'Select whether there are any relevant links' },
    },
  },
  ...(
    [
      ['numerator', numerator],
      ['denominator', denominator],
    ] as const
  ).map(([part, route]) => ({
    name: part,
    route,
    pageTitle: `What are the details of the ${part}?`,
    loaderData: { id: indicator.id, values: providerSourcesUnanswered, providers: [] },
    rejected: {
      values: providerSourcesUnanswered,
      fieldErrors: { sources: `Add at least one data provider for the ${part}` },
    },
  })),
  sectionForm(
    'variance and quality',
    varianceAndQuality,
    varianceAndQualitySection,
    'Variance and quality',
    { variation: 'Enter how the indicator varies' },
  ),
  sectionForm('justifications', justifications, justificationsSection, 'Justifications', {
    hasExclusions: 'Select whether there have been any exclusions',
  }),
  sectionForm('other comments', otherComments, otherCommentsSection, 'Other comments', {
    hasReviewerComments: 'Select whether you have additional comments',
  }),
  sectionForm(
    'copyright and data re-use',
    copyrightAndDataReuse,
    copyrightAndDataReuseSection,
    'Copyright and data re-use',
    { hasCustomCopyright: 'Select whether the copyright is anything other than Crown copyright' },
  ),
  sectionForm('benchmarking', benchmarking, benchmarkingSection, 'Benchmarking', {
    hasGoalBenchmark: 'Select whether there are any goal benchmarks for this indicator',
  }),
  {
    name: 'sex and ages',
    route: sexAndAges,
    pageTitle: 'What are the sexes and ages included in this indicator?',
    loaderData: { id: indicator.id, values: sexAndAgesUnanswered },
    rejected: {
      values: sexAndAgesUnanswered,
      fieldErrors: { sexes: 'Select sexes included', ageType: 'Select the age type' },
    },
  },
  {
    name: 'tagging',
    route: tagging,
    pageTitle: 'Add tags for this indicator',
    loaderData: { id: indicator.id, options: tagOptions, values: taggingUnanswered },
    rejected: {
      values: taggingUnanswered,
      fieldErrors: { topicIds: 'Select at least one topic' },
    },
  },
  {
    name: 'indicator overview, for a reviewer adding a note',
    route: overview,
    pageTitle: 'Indicator overview',
    loaderData: {
      canEdit: false,
      isReviewer: true,
      indicator: {
        ...indicator,
        teamId: TEAM_IDS.teamA,
        draftLocked: true,
        draftSubmissionStatus: 'in_review',
        draftResponseKind: null,
        draftReviewers: [],
        draftSubmissionNumber: 1,
        draftScheduledPublishAt: null,
        draftFirstSubmittedAt: '2026-01-02T00:00:00.000Z',
        nameVersion: 'a'.repeat(64),
        actions: [],
      },
      notesForReviewers: null,
      reviewerNotes: { notes: [], form: { values: noteAdded, fieldErrors: {} } },
    },
    rejected: { values: noteAdded, fieldErrors: { reviewerNote: 'Enter your notes' } },
  },
  {
    name: 'new topic',
    route: newTopic,
    pageTitle: 'Add a topic',
    rejected: { values: topic, fieldErrors: { slug: 'This slug is already used' } },
  },
  {
    name: 'edit topic',
    route: editTopic,
    pageTitle: 'Edit topic',
    loaderData: { topic },
    rejected: { values: topic, fieldErrors: { slug: 'This slug is already used' } },
  },
];

// Server-renders the document as a no-JavaScript POST gets it, under a root titled as the apps' are.
function renderDocument({ route, loaderData }: (typeof forms)[number], actionData?: unknown) {
  const Routes = createRoutesStub([
    {
      id: 'root',
      path: '/',
      meta: createDocumentMeta(),
      Component: () => (
        <html lang="en">
          <head>
            <Meta />
          </head>
          <body>
            <Outlet />
          </body>
        </html>
      ),
      children: [
        {
          id: 'form',
          path: 'form',
          meta: route.meta,
          Component: route.default,
          action: () => null,
          ...(loaderData === undefined ? {} : { loader: () => loaderData }),
        },
      ],
    },
  ]);

  return renderToString(
    <Routes
      hydrationData={{
        loaderData: loaderData === undefined ? {} : { form: loaderData },
        actionData: actionData === undefined ? null : { form: actionData },
      }}
      initialEntries={['/form']}
    />,
  );
}

function titlesIn(html: string) {
  return [...html.matchAll(/<title>(.*?)<\/title>/g)].map(([, title]) => title);
}

describe.each(forms)('the $name form', (form) => {
  it('declares its back link', () => {
    expect(form.route.handle).toHaveProperty('backHref');
  });

  it('server-renders one title, named after the page', () => {
    expect(titlesIn(renderDocument(form))).toEqual([`${form.pageTitle} - ${serviceName} - GOV.UK`]);
  });

  it('server-renders one title starting "Error: " after a rejected submission', () => {
    expect(titlesIn(renderDocument(form, form.rejected))).toEqual([
      `Error: ${form.pageTitle} - ${serviceName} - GOV.UK`,
    ]);
  });

  it('server-renders a refusal that names no field in the summary, titled "Error: "', () => {
    const html = renderDocument(form, {
      ...(form.rejected as object),
      fieldErrors: {},
      formError: FORM_NOT_SAVED,
    });

    expect(titlesIn(html)).toEqual([`Error: ${form.pageTitle} - ${serviceName} - GOV.UK`]);
    expect(html).toMatch(/class="govuk-error-summary"/);
    expect(html).toContain(FORM_NOT_SAVED);
  });
});
