import { TEAM_IDS } from '@fphd/auth';
import {
  calculationSection,
  confidenceIntervalsSection,
  DEFAULT_PUBLISHING_TIME,
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
  updateSummarySection,
  valueTypeAndUnitsSection,
  varianceAndQualitySection,
} from '@fphd/internal-api-features/contract';
import { createDocumentMeta, serviceName } from '@fphd/ui';
import type { ComponentType } from 'react';
import { renderToString } from 'react-dom/server';
import { createRoutesStub, Meta, type MetaFunction, Outlet } from 'react-router';
import { describe, expect, it } from 'vitest';

import { FORM_NOT_SAVED } from './form-refusal.ts';
import * as ages from './indicator-ages/route.tsx';
import * as benchmarking from './indicator-benchmarking/route.tsx';
import * as calculation from './indicator-calculation/route.tsx';
import * as confidenceIntervals from './indicator-confidence-intervals/route.tsx';
import * as definitionAndRationale from './indicator-definition-and-rationale/route.tsx';
import * as formatAndSources from './indicator-format-and-sources/route.tsx';
import * as justifications from './indicator-justifications/route.tsx';
import * as editIndicatorName from './indicator-name/edit-route.tsx';
import * as newIndicator from './indicator-name/new-route.tsx';
import * as otherComments from './indicator-other-comments/route.tsx';
import * as otherNotesAndCaveats from './indicator-other-notes-and-caveats/route.tsx';
import * as overview from './indicator-overview/route.tsx';
import * as periodType from './indicator-period-type/route.tsx';
import * as polarity from './indicator-polarity/route.tsx';
import * as publishingDate from './indicator-publishing-date/route.tsx';
import * as sexGenderAndEthnicity from './indicator-sex-gender-and-ethnicity/route.tsx';
import * as tagging from './indicator-tagging/route.tsx';
import * as updateFrequency from './indicator-update-frequency/route.tsx';
import * as updateSummary from './indicator-update-summary/route.tsx';
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

const sexGenderAndEthnicityUnanswered = {
  demographics: [],
  sexes: [],
  genders: [],
  ethnicGroups: [],
};

const periodTypeUnanswered = {
  ...unanswered(periodTypeSection),
  timePeriods: [],
};

const benchmarkingUnanswered = {
  hasGoalBenchmark: '',
  goals: [
    {
      lowerComparison: '',
      lowerValue: '',
      upperComparison: '',
      upperValue: '',
      polarity: '',
      detail: '',
    },
  ],
};

const agesUnanswered = {
  ageType: '',
  ageRanges: [{ lowerLimit: '', lowerLimitUnit: '', upperLimit: '', upperLimitUnit: '' }],
  specificAge: '',
  specificAgeUnit: '',
  ageDetail: '',
};

const taggingUnanswered = {
  topicIds: [],
  subtopicIds: [],
  indicatorTypeIds: [],
  hasFramework: '',
  frameworkIds: [],
  phofIndicatorNumber: '',
  hasLifeStage: '',
  lifeStageIds: [],
  hasRiskFactor: '',
  riskFactorIds: [],
  addTopic: '',
  addSubtopic: '',
  addFramework: '',
  addLifeStage: '',
  addRiskFactor: '',
};

const tagOptions = {
  topics: [],
  subtopics: [],
  indicatorTypes: [],
  frameworks: [],
  lifeStages: [],
  riskFactors: [],
};

const formatAndSourcesUnanswered = {
  hasNumeratorDenominator: '',
  numeratorSources: [],
  numeratorDefinition: '',
  numeratorDisclosureControl: '',
  numeratorDisclosureControlDetail: '',
  numeratorProviderId: '',
  numeratorSourceId: '',
  denominatorSources: [],
  denominatorDefinition: '',
  denominatorDisclosureControl: '',
  denominatorDisclosureControlDetail: '',
  denominatorProviderId: '',
  denominatorSourceId: '',
  dataValues: [
    {
      sources: [],
      definition: '',
      disclosureControl: '',
      disclosureControlDetail: '',
      providerId: '',
      sourceId: '',
    },
  ],
};

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
    'calculation',
    calculation,
    calculationSection,
    'How the indicator was calculated',
    { calculatedBy: 'Select who calculated the indicator' },
    { valueType: null },
  ),
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
    'Value types, counts and units',
    { valueTypeId: 'Select the value type' },
    { valueTypes: [] },
  ),
  sectionForm(
    'quality, caveats and interpretation',
    otherNotesAndCaveats,
    otherNotesAndCaveatsSection,
    'Quality, caveats and interpretation',
    { hasCaveats: 'Select whether there are any caveats needed' },
  ),
  sectionForm(
    'publishing date',
    publishingDate,
    publishingDateSection,
    'When should this indicator be published?',
    { publishingDateDay: 'Enter the publishing date' },
    { isUpdate: false },
    { ...unanswered(publishingDateSection), ...DEFAULT_PUBLISHING_TIME },
  ),
  {
    name: 'indicator format and sources',
    route: formatAndSources,
    pageTitle: 'Indicator format and sources',
    loaderData: { id: indicator.id, values: formatAndSourcesUnanswered, providers: [] },
    rejected: {
      values: formatAndSourcesUnanswered,
      fieldErrors: {
        hasNumeratorDenominator: 'Select whether this indicator has a numerator and denominator',
      },
    },
  },
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
    'update summary',
    updateSummary,
    updateSummarySection,
    'What is the summary of this update?',
    { updateSummary: 'Enter a summary of this update' },
  ),
  {
    name: 'policy goals',
    route: benchmarking,
    pageTitle: 'Are there any policy goal benchmarks for this indicator?',
    loaderData: { id: indicator.id, values: benchmarkingUnanswered },
    rejected: {
      values: benchmarkingUnanswered,
      fieldErrors: {
        hasGoalBenchmark: 'Select whether there are any goal benchmarks for this indicator',
      },
    },
  },
  {
    name: 'sex, gender and ethnicity',
    route: sexGenderAndEthnicity,
    pageTitle: 'Sex, gender and ethnicity',
    loaderData: { id: indicator.id, values: sexGenderAndEthnicityUnanswered },
    rejected: {
      values: sexGenderAndEthnicityUnanswered,
      fieldErrors: { demographics: 'Select what was collected for this indicator' },
    },
  },
  {
    name: 'time periods',
    route: periodType,
    pageTitle: 'Time periods',
    loaderData: { id: indicator.id, values: periodTypeUnanswered },
    rejected: {
      values: periodTypeUnanswered,
      fieldErrors: { timePeriods: 'Select the time periods included in this indicator' },
    },
  },
  {
    name: 'ages',
    route: ages,
    pageTitle: 'What ages are included in this indicator?',
    loaderData: { id: indicator.id, values: agesUnanswered },
    rejected: { values: agesUnanswered, fieldErrors: { ageType: 'Select the age type' } },
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
        draftFastTrackReason: null,
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
