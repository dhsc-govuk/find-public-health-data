import type { ReactNode } from 'react';

import { DependentFields, MandatoryFields } from './metadata-fields.tsx';
import type { GuidanceAnchor } from './paths.ts';
import {
  NewIndicatorsReview,
  PublishingDate,
  UpdateFrequency,
  UpdatesReview,
} from './publishing.tsx';
import { ReviewerNotesFields } from './reviewer-notes-fields.tsx';
import { StandardMethods } from './standard-methods.tsx';
import {
  MarkdownGuidance,
  PlainLanguage,
  SentenceLength,
  TechnicalTerms,
  Vocabulary,
} from './writing.tsx';

interface GuidancePart {
  anchor: GuidanceAnchor;
  title: string;
  content: ReactNode;
}

/** A section of the guidance: its own content, then each of its parts under a heading of its own. */
export interface GuidanceSection {
  anchor: GuidanceAnchor;
  title: string;
  content?: ReactNode;
  parts?: readonly GuidancePart[];
}

/** The guidance in the order the page shows it, which its contents list follows. */
export const GUIDANCE_SECTIONS: readonly GuidanceSection[] = [
  {
    anchor: 'accessible-content',
    title: 'Writing accessible content',
    parts: [
      {
        anchor: 'sentence-length',
        title: 'Sentence and paragraph length',
        content: <SentenceLength />,
      },
      {
        anchor: 'technical-terms',
        title: 'Technical terms and acronyms',
        content: <TechnicalTerms />,
      },
      {
        anchor: 'plain-language',
        title: 'Plain language alternatives',
        content: <PlainLanguage />,
      },
      { anchor: 'vocabulary', title: 'Vocabulary and punctuation', content: <Vocabulary /> },
    ],
  },
  { anchor: 'markdown', title: 'Formatting text with markdown', content: <MarkdownGuidance /> },
  {
    anchor: 'metadata',
    title: 'Metadata',
    parts: [
      { anchor: 'mandatory-fields', title: 'Mandatory', content: <MandatoryFields /> },
      { anchor: 'standardised-fields', title: 'Standardised fields', content: <StandardMethods /> },
      { anchor: 'dependent-fields', title: 'Dependent on indicator', content: <DependentFields /> },
    ],
  },
  {
    anchor: 'publishing',
    title: 'Publishing',
    parts: [
      { anchor: 'update-frequency', title: 'Update frequency', content: <UpdateFrequency /> },
      { anchor: 'publishing-date', title: 'Publishing date', content: <PublishingDate /> },
    ],
  },
  {
    anchor: 'notes-for-reviewers',
    title: 'Notes for reviewers (only for internal use and for new indicators)',
    content: <ReviewerNotesFields />,
  },
  {
    anchor: 'review-process',
    title: 'Review process',
    parts: [
      { anchor: 'new-indicators', title: 'New indicators', content: <NewIndicatorsReview /> },
      { anchor: 'indicator-updates', title: 'Updates to indicators', content: <UpdatesReview /> },
    ],
  },
];
