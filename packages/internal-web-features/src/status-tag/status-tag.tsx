import type {
  DraftStatus,
  DraftSubmissionStatus,
  IndicatorStatus,
  IndicatorTaskStatus,
  ReviewResponseKind,
} from '@fphd/internal-api-features/contract';
import { Tag } from '@fphd/ui';

type Colour = 'blue' | 'green' | 'orange' | 'red' | 'teal' | 'yellow';

interface TagFace {
  label: string;
  /** The wording where no column header names the status, as under an indicator's heading. */
  standaloneLabel?: string;
  colour: Colour;
}

const INDICATOR_STATUS: Record<IndicatorStatus, TagFace> = {
  new: { label: 'New', standaloneLabel: 'New indicator', colour: 'blue' },
  live: { label: 'Live', standaloneLabel: 'Live indicator', colour: 'teal' },
};

const DRAFT_STATUS: Record<DraftStatus, TagFace> = {
  draft: { label: 'Incomplete', colour: 'blue' },
  scheduled: { label: 'Publishing scheduled', colour: 'yellow' },
};

// A withdrawn submission leaves the draft as it was before it was submitted, and one sent back for
// changes is named by what its response asked for.
const SUBMISSION_STATUS: Partial<Record<DraftSubmissionStatus, TagFace>> = {
  submitted: { label: 'Pending review', colour: 'yellow' },
  in_review: { label: 'Pending review', colour: 'yellow' },
  approved: { label: 'Publishing scheduled', colour: 'yellow' },
};

const CHANGES_REQUESTED: Record<Exclude<ReviewResponseKind, 'approved'>, TagFace> = {
  pre_imrg_feedback: { label: 'Revisions or clarifications advised', colour: 'orange' },
  minor_revisions: { label: 'Minor revisions needed', colour: 'orange' },
  major_revisions: { label: 'Major revisions needed', colour: 'red' },
};

const PUBLISHED: TagFace = { label: 'Published', colour: 'green' };

// GOV.UK's task list shows a completed task as plain text, and one still to do, started or not, as
// a blue "Incomplete" tag.
const TASK_STATUS: Record<IndicatorTaskStatus, TagFace | string> = {
  not_started: { label: 'Incomplete', colour: 'blue' },
  in_progress: { label: 'Incomplete', colour: 'blue' },
  completed: 'Completed',
};

// A task a review response flagged, until it is saved: advised before IMRG meets, needed after.
const REVISION_STATUS: Record<'advised' | 'needed', TagFace> = {
  advised: { label: 'Revisions advised', colour: 'orange' },
  needed: { label: 'Revisions needed', colour: 'red' },
};

interface PublishingState {
  indicatorStatus: IndicatorStatus;
  draftStatus: DraftStatus | null;
  draftSubmissionStatus: DraftSubmissionStatus | null;
  draftResponseKind: ReviewResponseKind | null;
}

/** Where the draft's latest submission stands, if that names the draft's label. */
function submissionFace({
  draftSubmissionStatus,
  draftResponseKind,
}: PublishingState): TagFace | undefined {
  if (draftSubmissionStatus === 'changes_requested') {
    return draftResponseKind === null || draftResponseKind === 'approved'
      ? undefined
      : CHANGES_REQUESTED[draftResponseKind];
  }
  return draftSubmissionStatus === null ? undefined : SUBMISSION_STATUS[draftSubmissionStatus];
}

/**
 * What is in flight: the draft, or where its latest submission stands. A draft of a live
 * indicator is an update, so its label says so; a live indicator with no draft is published as
 * it stands. A new indicator with no draft cannot be made, so it has no label.
 */
function publishingStatus(state: PublishingState): TagFace | undefined {
  const { indicatorStatus, draftStatus } = state;

  if (draftStatus === null) return indicatorStatus === 'live' ? PUBLISHED : undefined;

  const { colour, label } = submissionFace(state) ?? DRAFT_STATUS[draftStatus];

  return indicatorStatus === 'live'
    ? { colour, label: `Update ${label.toLowerCase()}` }
    : { colour, label };
}

export type StatusTagProps = (
  | { type: 'indicator'; status: IndicatorStatus }
  | ({ type: 'publishing' } & PublishingState)
  | { type: 'task'; status: IndicatorTaskStatus }
  | { type: 'revision'; status: keyof typeof REVISION_STATUS }
) & {
  /**
   * Set false where something else, such as a column header, already names the status: the
   * tag then drops its hidden prefix and uses its short wording.
   */
  labelled?: boolean;
};

// A task's status is already read out with its link, so only the indicator's two are prefixed.
const PREFIX: Partial<Record<StatusTagProps['type'], string>> = {
  indicator: 'Indicator status: ',
  publishing: 'Publishing status: ',
};

function faceOf(props: StatusTagProps): TagFace | string | undefined {
  switch (props.type) {
    case 'indicator':
      return INDICATOR_STATUS[props.status];
    case 'publishing':
      return publishingStatus(props);
    case 'task':
      return TASK_STATUS[props.status];
    case 'revision':
      return REVISION_STATUS[props.status];
  }
}

/** A status as the publisher reads it: the tag's colour and wording are decided here alone. */
export function StatusTag(props: StatusTagProps) {
  const face = faceOf(props);

  if (face === undefined) return null;
  if (typeof face === 'string') return face;

  const labelled = props.labelled !== false;
  const prefix = labelled ? PREFIX[props.type] : undefined;
  const label = labelled ? (face.standaloneLabel ?? face.label) : face.label;

  return (
    <Tag className="fphd-status-tag" classModifiers={face.colour}>
      {prefix === undefined ? null : <span className="govuk-visually-hidden">{prefix}</span>}
      {label}
    </Tag>
  );
}
