import type { JwtSessionVerifier } from '@fphd/auth/jwt-session';
import { Router } from 'express';

import {
  agesSection,
  benchmarkingSection,
  calculationSection,
  copyrightAndDataReuseSection,
  dataQualitySection,
  definitionAndRationaleSection,
  denominatorSection,
  justificationsSection,
  numeratorSection,
  otherCommentsSection,
  otherNotesAndCaveatsSection,
  periodTypeSection,
  polaritySection,
  sexAndAgesSection,
  updateFrequencySection,
  varianceAndQualitySection,
} from './contract.ts';
import { indicatorSectionRouter } from './indicator-section.ts';
import {
  benchmarkingColumns,
  calculationColumns,
  confidenceIntervalsColumns,
  copyrightAndDataReuseColumns,
  dataQualityColumns,
  definitionAndRationaleColumns,
  justificationsColumns,
  otherCommentsColumns,
  otherNotesAndCaveatsColumns,
  periodTypeColumns,
  polarityColumns,
  publishingDateColumns,
  updateFrequencyColumns,
  valueTypeAndUnitsColumns,
  varianceAndQualityColumns,
} from './indicator-section-columns.ts';
import {
  agesColumns,
  denominatorColumns,
  numeratorColumns,
  sexAndAgesColumns,
  taggingColumns,
} from './indicator-section-list-columns.ts';
import {
  confidenceIntervalsServerSection,
  providerSourcesServerSection,
  publishingDateServerSection,
  taggingServerSection,
  valueTypeAndUnitsServerSection,
} from './indicator-section-validators.ts';
import type { InternalRepositories } from './repositories.ts';

/** GET and PUT for every section of a draft; `now` is the clock for the publishing date's notice. */
export function indicatorSectionsRouter(
  {
    indicators,
    ciMethods,
    tags,
    dataProviders,
    valueTypesAndUnits,
  }: Pick<
    InternalRepositories,
    'indicators' | 'ciMethods' | 'tags' | 'dataProviders' | 'valueTypesAndUnits'
  >,
  session: JwtSessionVerifier,
  now: () => Date = () => new Date(),
): Router {
  return Router().use(
    indicatorSectionRouter(
      indicators,
      session,
      definitionAndRationaleSection,
      definitionAndRationaleColumns,
    ),
    indicatorSectionRouter(indicators, session, polaritySection, polarityColumns),
    indicatorSectionRouter(indicators, session, dataQualitySection, dataQualityColumns),
    indicatorSectionRouter(
      indicators,
      session,
      providerSourcesServerSection(numeratorSection, dataProviders),
      numeratorColumns,
    ),
    indicatorSectionRouter(
      indicators,
      session,
      providerSourcesServerSection(denominatorSection, dataProviders),
      denominatorColumns,
    ),
    indicatorSectionRouter(indicators, session, calculationSection, calculationColumns),
    indicatorSectionRouter(
      indicators,
      session,
      confidenceIntervalsServerSection(ciMethods),
      confidenceIntervalsColumns,
    ),
    indicatorSectionRouter(indicators, session, updateFrequencySection, updateFrequencyColumns),
    indicatorSectionRouter(indicators, session, periodTypeSection, periodTypeColumns),
    indicatorSectionRouter(
      indicators,
      session,
      valueTypeAndUnitsServerSection(valueTypesAndUnits),
      valueTypeAndUnitsColumns,
    ),
    indicatorSectionRouter(
      indicators,
      session,
      otherNotesAndCaveatsSection,
      otherNotesAndCaveatsColumns,
    ),
    indicatorSectionRouter(
      indicators,
      session,
      publishingDateServerSection(now),
      publishingDateColumns,
    ),
    indicatorSectionRouter(
      indicators,
      session,
      varianceAndQualitySection,
      varianceAndQualityColumns,
    ),
    indicatorSectionRouter(indicators, session, justificationsSection, justificationsColumns),
    indicatorSectionRouter(indicators, session, otherCommentsSection, otherCommentsColumns),
    indicatorSectionRouter(
      indicators,
      session,
      copyrightAndDataReuseSection,
      copyrightAndDataReuseColumns,
    ),
    indicatorSectionRouter(indicators, session, benchmarkingSection, benchmarkingColumns),
    indicatorSectionRouter(indicators, session, sexAndAgesSection, sexAndAgesColumns),
    indicatorSectionRouter(indicators, session, agesSection, agesColumns),
    indicatorSectionRouter(indicators, session, taggingServerSection(tags), taggingColumns),
  );
}
