import type {
  IndicatorAdminDetail,
  NotesForReviewers as Notes,
} from '@fphd/internal-api-features/contract';
import { SummaryList } from '@fphd/ui';

type AnswersState = Pick<IndicatorAdminDetail, 'draftStatus' | 'draftSubmissionStatus'>;

/**
 * What an unanswered question reads. A draft never submitted may still be answered, so it reads
 * as the prototype's preview page has it. Once submitted or published, it reads as the
 * prototype's assign and review overviews have it.
 */
export function unansweredText({ draftStatus, draftSubmissionStatus }: AnswersState): string {
  return draftStatus !== null && draftSubmissionStatus === null
    ? '[Not entered yet]'
    : 'Not provided';
}

function textAnswer(text: string | null, unanswered: string): string {
  return text || unanswered;
}

/** A yes/no answer, with the detail a yes gives. */
function yesNoAnswer(answer: string | null, detail: string | null, unanswered: string): string {
  if (answer === 'yes') return detail ? `Yes - ${detail}` : 'Yes';
  if (answer === 'no') return 'No';
  return unanswered;
}

interface Row {
  question: string;
  answer: string;
}

function NotesSection({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <>
      <h3 className="govuk-heading-m">{title}</h3>
      <SummaryList
        items={rows.map(({ question, answer }) => ({
          name: question,
          children: <span className="fphd-metadata-text">{answer}</span>,
        }))}
      />
    </>
  );
}

interface NotesForReviewersProps {
  notes: Notes;
  /** The indicator the notes are from, whose state decides how an unanswered question reads. */
  indicator: AnswersState;
}

/** What the publisher wrote for the indicator's reviewers, as the forms asked it. */
export function NotesForReviewers({ notes, indicator }: NotesForReviewersProps) {
  const { varianceAndQuality: quality, justifications, otherComments } = notes;
  const unanswered = unansweredText(indicator);

  return (
    <>
      <h2 className="govuk-heading-m">Notes for reviewers</h2>
      <NotesSection
        title="Variance and quality"
        rows={[
          {
            question: 'How does the indicator vary?',
            answer: textAnswer(quality.variation, unanswered),
          },
          {
            question: 'What quality assurance has been done on the indicator?',
            answer: textAnswer(quality.qualityAssurance, unanswered),
          },
          // The improvement notes are optional, so the question shows only once answered.
          ...(quality.sourceDataIssuesDetail
            ? [
                {
                  question:
                    'If there are any data quality issues, what is being done to improve the quality?',
                  answer: quality.sourceDataIssuesDetail,
                },
              ]
            : []),
        ]}
      />
      <NotesSection
        title="Justifications"
        rows={[
          {
            question: 'Why was the confidence interval method chosen?',
            answer: textAnswer(justifications.ciMethodJustification, unanswered),
          },
          {
            question: 'Why were the data sources chosen?',
            answer: textAnswer(justifications.dataSourcesJustification, unanswered),
          },
          {
            question: 'What health inequalities have been included?',
            answer: textAnswer(justifications.inequalitiesIncluded, unanswered),
          },
          {
            question: 'Have there been any exclusions?',
            answer: yesNoAnswer(
              justifications.hasExclusions,
              justifications.exclusionsDetail,
              unanswered,
            ),
          },
          {
            question: 'Have internal automation tools been used to create this indicator?',
            answer: yesNoAnswer(
              justifications.hasAutomation,
              justifications.automationDetail,
              unanswered,
            ),
          },
        ]}
      />
      <NotesSection
        title="Other comments"
        rows={[
          {
            question: 'Sponsors or stakeholders',
            answer: textAnswer(otherComments.sponsorsAndStakeholders, unanswered),
          },
          {
            question: 'Other comments',
            answer:
              otherComments.hasReviewerComments === 'no'
                ? 'None'
                : textAnswer(otherComments.reviewerCommentsDetail, unanswered),
          },
        ]}
      />
    </>
  );
}
