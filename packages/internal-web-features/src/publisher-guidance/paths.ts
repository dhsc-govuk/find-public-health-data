export const PUBLISHER_GUIDANCE_PATH = '/publish/guidance';

/**
 * The id of every heading and field row on the guidance page, which the contents list and the
 * section pages' guidance links point at. The page's test checks that each one is on the page.
 */
export const GUIDANCE_ANCHORS = [
  'accessible-content',
  'sentence-length',
  'technical-terms',
  'plain-language',
  'vocabulary',
  'markdown',
  'metadata',
  'mandatory-fields',
  'sex-gender-and-ethnicity',
  'name',
  'definition',
  'rationale',
  'numerator',
  'denominator',
  'standardised-fields',
  'standard-calculation-methods',
  'standard-ci-methods',
  'dependent-fields',
  'non-standard-calculation-method',
  'disclosure-control',
  'other-organisations',
  'other-or-modified-ci-method',
  'policy-goal',
  'caveats',
  'interpretation-notes',
  'publishing',
  'update-frequency',
  'publishing-date',
  'notes-for-reviewers',
  'variation',
  'quality-assurance',
  'data-quality-issues',
  'ci-method-justification',
  'data-sources-justification',
  'inequalities',
  'exclusions',
  'automation-tools',
  'sponsors-and-stakeholders',
  'reviewer-comments',
  'review-process',
  'new-indicators',
  'indicator-updates',
] as const;

export type GuidanceAnchor = (typeof GUIDANCE_ANCHORS)[number];

export function publisherGuidancePath(anchor: GuidanceAnchor): string {
  return `${PUBLISHER_GUIDANCE_PATH}#${anchor}`;
}
