import type { NotesForReviewers as Notes } from '@fphd/internal-api-features/contract';
import { SummaryList } from '@fphd/ui';

// As the indicator preview shows an unanswered question.
const NOT_ENTERED = '[Not entered yet]';

function textAnswer(text: string | null): string {
  return text || NOT_ENTERED;
}

/** A yes/no answer, with the detail a yes gives. */
function yesNoAnswer(answer: string | null, detail: string | null): string {
  if (answer === 'yes') return detail ? `Yes - ${detail}` : 'Yes';
  if (answer === 'no') return 'No';
  return NOT_ENTERED;
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

/** What the publisher wrote for the indicator's reviewers, as the forms asked it. */
export function NotesForReviewers({ notes }: { notes: Notes }) {
  const { varianceAndQuality: quality, justifications, otherComments } = notes;

  return (
    <>
      <h2 className="govuk-heading-m">Notes for reviewers</h2>
      <NotesSection
        title="Variance and quality"
        rows={[
          { question: 'How does the indicator vary?', answer: textAnswer(quality.variation) },
          {
            question: 'What quality assurance has been done on the indicator?',
            answer: textAnswer(quality.qualityAssurance),
          },
          {
            question: 'Are there any data quality issues with the source data?',
            answer: yesNoAnswer(quality.hasSourceDataIssues, quality.sourceDataIssuesDetail),
          },
        ]}
      />
      <NotesSection
        title="Justifications"
        rows={[
          {
            question: 'Why was the confidence interval method chosen?',
            answer: textAnswer(justifications.ciMethodJustification),
          },
          {
            question: 'Why were the data sources chosen?',
            answer: textAnswer(justifications.dataSourcesJustification),
          },
          {
            question: 'What health inequalities have been included?',
            answer: textAnswer(justifications.inequalitiesIncluded),
          },
          {
            question: 'Have there been any exclusions?',
            answer: yesNoAnswer(justifications.hasExclusions, justifications.exclusionsDetail),
          },
          {
            question: 'Have internal automation tools been used to create this indicator?',
            answer: yesNoAnswer(justifications.hasAutomation, justifications.automationDetail),
          },
        ]}
      />
      <NotesSection
        title="Other comments"
        rows={[
          {
            question: 'Sponsors or stakeholders',
            answer: textAnswer(otherComments.sponsorsAndStakeholders),
          },
          {
            question: 'Other comments',
            answer:
              otherComments.hasReviewerComments === 'no'
                ? 'None'
                : textAnswer(otherComments.reviewerCommentsDetail),
          },
        ]}
      />
    </>
  );
}
