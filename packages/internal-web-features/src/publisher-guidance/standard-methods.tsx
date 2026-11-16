import {
  CONFIDENCE_INTERVAL_DESCRIPTION,
  NO_STANDARD_METHOD,
  STANDARD_CALCULATION_METHODS,
  STANDARD_CONFIDENCE_INTERVAL_METHODS,
  type StandardMethod,
} from '@fphd/utils/standard-methods';

import { type GuidanceRow, GuidanceTable } from './guidance-table.tsx';

function methodRow({ name, description }: StandardMethod): GuidanceRow {
  return {
    header: name,
    cells: [<p className="govuk-body">{description ?? NO_STANDARD_METHOD}</p>],
  };
}

/** The standard calculation method of each value type, and of each confidence interval method. */
export function StandardMethods() {
  return (
    <>
      <h4 className="govuk-heading-s" id="standard-calculation-methods">
        Indicator calculation methods
      </h4>
      <GuidanceTable
        headings={['Value type', 'Standard method description']}
        labelledBy="standard-calculation-methods"
        rows={STANDARD_CALCULATION_METHODS.map(methodRow)}
      />
      <h4 className="govuk-heading-s" id="standard-ci-methods">
        Confidence interval methods
      </h4>
      <GuidanceTable
        headings={['Confidence interval method', 'Standard method description']}
        labelledBy="standard-ci-methods"
        rows={[
          {
            header: '[General]',
            cells: [<p className="govuk-body">{CONFIDENCE_INTERVAL_DESCRIPTION}</p>],
          },
          ...STANDARD_CONFIDENCE_INTERVAL_METHODS.map(methodRow),
        ]}
      />
    </>
  );
}
