import {
  PUBLISHING_NOTICE_WEEKS,
  type PublishingDateField,
  publishingDateSection,
} from '@fphd/internal-api-features/contract';
import { Checkboxes, firstCheckboxId, Textarea } from '@fphd/ui';

import { IndicatorSectionForm, type SectionPageProps } from '../indicator-section-form.tsx';
import { PublishingDateFields, publishingDateFieldIds } from '../publishing-date-fields.tsx';

interface PublishingDatePageProps extends SectionPageProps<PublishingDateField> {
  /** Whether the draft updates a live indicator. */
  isUpdate?: boolean;
}

const NEW_INDICATOR_WORDING = {
  dateHint: `This date must be at least ${PUBLISHING_NOTICE_WEEKS} weeks from when you submit the indicator, to allow for IMRG review. Unless this indicator needs to be fast-tracked, but you will need to explain why. Use numbers only in the format DD MM YYYY.`,
  fastTracked: 'This indicator needs to be fast-tracked',
};

const UPDATE_WORDING = {
  dateHint: `This date must be at least ${PUBLISHING_NOTICE_WEEKS} weeks from when you submit the update, to allow for possible IMRG review. Unless this update needs to be fast-tracked, but you will need to explain why. Use numbers only in the format DD MM YYYY.`,
  fastTracked: 'This update needs to be fast-tracked',
};

export function PublishingDatePage({ isUpdate = false, ...form }: PublishingDatePageProps) {
  const { fieldErrors, values } = form;
  const wording = isUpdate ? UPDATE_WORDING : NEW_INDICATOR_WORDING;

  return (
    <IndicatorSectionForm
      guidance="publishing-date"
      fieldIds={{ ...publishingDateFieldIds, fastTracked: firstCheckboxId('fastTracked') }}
      form={form}
      section={publishingDateSection}
      title={
        isUpdate
          ? 'When should this update be published?'
          : 'When should this indicator be published?'
      }
    >
      <PublishingDateFields dateHint={wording.dateHint} fieldErrors={fieldErrors} values={values}>
        {/* A single checkbox has no question of its own, so it sits in no fieldset. */}
        <div className="govuk-form-group">
          <div className="govuk-checkboxes">
            <Checkboxes.Item
              conditional={
                <Textarea
                  defaultValue={values.fastTrackReason}
                  error={fieldErrors.fastTrackReason}
                  label="Enter reason for fast-tracking"
                  name="fastTrackReason"
                  rows={5}
                />
              }
              defaultChecked={values.fastTracked === 'yes'}
              id={firstCheckboxId('fastTracked')}
              label={wording.fastTracked}
              name="fastTracked"
              value="yes"
            />
          </div>
        </div>
      </PublishingDateFields>
    </IndicatorSectionForm>
  );
}
