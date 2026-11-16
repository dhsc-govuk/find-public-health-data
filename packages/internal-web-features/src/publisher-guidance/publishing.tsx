import {
  hasUpdateFrequencyReason,
  UPDATE_FREQUENCIES,
  UPDATE_FREQUENCY_LABELS,
} from '@fphd/utils/update-frequency';

export function UpdateFrequency() {
  return (
    <>
      <p className="govuk-body">
        This field is to give consumers an indication of how often new data is added to an
        indicator. It should also be used to indicate when an indicator will no longer be updated.
      </p>
      <p className="govuk-body">The options are:</p>
      <ul className="govuk-list govuk-list--bullet">
        {UPDATE_FREQUENCIES.map((frequency) => (
          <li key={frequency}>
            {UPDATE_FREQUENCY_LABELS[frequency]}
            {hasUpdateFrequencyReason(frequency)
              ? ' - you will need to provide a reason for this'
              : null}
          </li>
        ))}
      </ul>
    </>
  );
}

export function PublishingDate() {
  return (
    <>
      <p className="govuk-body">
        This is the date you propose the indicator or indicator update should be published.
      </p>
      <p className="govuk-body">
        The time between the date you submit for review and the proposed publishing date must be at
        least 8 weeks, to allow for possible IMRG review turnaround. If you need to fast-track an
        indicator or update, you must provide a reason.
      </p>
    </>
  );
}

export function NewIndicatorsReview() {
  return (
    <>
      <p className="govuk-body">
        When you submit a new indicator for review, it will be assigned to 2 reviewers. They will
        check through the indicator and its metadata and can then either:
      </p>
      <ul className="govuk-list govuk-list--bullet">
        <li>
          provide feedback before IMRG review, either advising revisions, requesting clarification,
          or both
        </li>
        <li>take the indicator to IMRG review</li>
      </ul>
      <p className="govuk-body">
        If the reviewers advise revisions, they can specify which part of the indicator’s data or
        metadata they suggest needs revising. You will get a notification if this happens.
      </p>
      <p className="govuk-body">When you go into your indicator in the system, you can:</p>
      <ul className="govuk-list govuk-list--bullet">
        <li>see what feedback has been sent</li>
        <li>
          select the relevant tasks and either make changes or continue without making changes
        </li>
        <li>provide a revision and clarification response, as required</li>
        <li>resubmit the indicator for re-review</li>
      </ul>
      <p className="govuk-body">Once the indicator has gone to IMRG review, it will either be:</p>
      <ul className="govuk-list govuk-list--bullet">
        <li>approved for publishing</li>
        <li>rejected with minor revisions needed</li>
        <li>rejected with major revisions needed</li>
      </ul>
      <p className="govuk-body">
        If IMRG requests revisions, they can specify which part of the indicator’s data or metadata
        needs revising. You will get a notification if this happens.
      </p>
      <p className="govuk-body">
        Your available actions are the same as with the pre-IMRG feedback process.
      </p>
      <p className="govuk-body">
        Once the indicator has been approved for publishing, the core DHSC team will confirm the
        publication date. They may change the date from the one you initially proposed. Once the
        publication date has been confirmed, the indicator will go live on the specified date.
      </p>
    </>
  );
}

export function UpdatesReview() {
  return (
    <>
      <p className="govuk-body">An update can include any of the following:</p>
      <ul className="govuk-list govuk-list--bullet">
        <li>adding new data only</li>
        <li>revising existing data</li>
        <li>replacing all existing data</li>
        <li>changing any metadata</li>
      </ul>
      <p className="govuk-body">
        If you are revising data, you need to ensure that facts are consistent. The following can
        change:
      </p>
      <ul className="govuk-list govuk-list--bullet">
        <li>value</li>
        <li>count</li>
        <li>numerator</li>
        <li>denominator</li>
        <li>CI values</li>
      </ul>
      <p className="govuk-body">
        But all other dimensional values must be the same, such as time period, sex or geographic
        area. If any of these other dimensional values are different the system will treat this as a
        new fact in the indicator.
      </p>
      <p className="govuk-body">
        For any update you will need to provide an update summary that will be visible on the
        consumer-facing ‘About this indicator’ section. This should briefly explain what has been
        added or changed, and why if necessary. You can also provide additional detail about the
        update for reviewer use only.
      </p>
      <p className="govuk-body">
        When you submit an update, the core DHSC team will check it and decide whether the update
        should be:
      </p>
      <ul className="govuk-list govuk-list--bullet">
        <li>sent for IMRG review</li>
        <li>revised</li>
        <li>published with visibility in history</li>
        <li>
          published without visibility in history - this would only be for minor changes like fixing
          a typo in metadata
        </li>
      </ul>
      <p className="govuk-body">
        Revisions and IMRG review will follow the same process as for new indicators.
      </p>
      <p className="govuk-body">
        Once an update has been approved for publishing, the core DHSC team will confirm the
        publication date. They may change the date from the one you initially proposed. Once the
        publication date has been confirmed, the update will go live on the specified date.
      </p>
    </>
  );
}
