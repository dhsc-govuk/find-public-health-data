import {
  DATA_TABLE_ROWS_PER_PAGE,
  dataTableFileRefusal,
} from '@fphd/internal-api-features/contract';
import {
  Button,
  DocumentTitle,
  ErrorMessage,
  ErrorSummary,
  fieldInputId,
  GridColumn,
  GridRow,
  Input,
  initNewErrorSummaries,
  Label,
  Pagination,
  Select,
  Table,
  TableScrollRegion,
} from '@fphd/ui';
import { type FormEvent, useEffect, useState } from 'react';

import { indicatorDataTableCheckPath, indicatorDataTablePath } from '../publish-paths.ts';
import { checkColumns, rowsShowing, uploadSummary } from './check-data.ts';
import type { DataTableCheckData } from './check-loader.ts';
import type { DataTableProblem, DataTableUploadFailure } from './loader.ts';
import { problemRows } from './problem-content.tsx';

const FIELD = 'dataTable';
const ERROR_ID = `${FIELD}-error`;
const UPLOAD_HEADING = 'Upload indicator data table';
const UPLOADING = 'Uploading and checking your data table. This can take a few minutes.';

/** The browser's own refusal of the chosen file, counted so each one is announced afresh. */
function useBrowserRefusal(): [
  { message: string; count: number } | undefined,
  (message: string | undefined) => void,
] {
  const [refusal, setRefusal] = useState<{ message: string; count: number }>();

  useEffect(() => {
    if (refusal !== undefined) void initNewErrorSummaries();
  }, [refusal]);

  return [
    refusal,
    (message) =>
      setRefusal((last) =>
        message === undefined ? undefined : { message, count: (last?.count ?? 0) + 1 },
      ),
  ];
}

interface UploadDataTablePageProps {
  fieldErrors?: DataTableUploadFailure['fieldErrors'] | undefined;
  formError?: string | undefined;
}

// The heading is the field's label, as GOV.UK asks of a page with a single question, which
// FileUpload cannot do; upstream: daniel-ac-martin/NotGovUK#2057.
export function UploadDataTablePage({ fieldErrors = {}, formError }: UploadDataTablePageProps) {
  // Says the upload is under way once Continue is pressed, as a large file takes a while to send
  // and check. Without JavaScript the browser's own progress shows instead.
  const [uploading, setUploading] = useState(false);
  const [refusal, refuse] = useBrowserRefusal();
  // Once a file is on its way, the last refusal no longer applies.
  const error = uploading ? undefined : (refusal?.message ?? fieldErrors[FIELD]);
  const shownFormError = uploading || refusal !== undefined ? undefined : formError;
  const inputId = fieldInputId(FIELD);

  // The browser refuses what the API would, before sending a file it would only send back.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    const input = event.currentTarget.elements.namedItem(FIELD);
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
    const message = dataTableFileRefusal(file ?? { name: '', size: 0 });

    if (message === undefined) {
      refuse(undefined);
      setUploading(true);
    } else {
      event.preventDefault();
      refuse(message);
    }
  };

  return (
    <>
      <DocumentTitle
        hasErrors={error !== undefined || shownFormError !== undefined}
        pageTitle={UPLOAD_HEADING}
      />
      <ErrorSummary
        // A new summary for each refusal, so GOV.UK Frontend sets it up and focuses it again.
        key={refusal?.count ?? 'server'}
        errors={error === undefined ? [] : [{ name: FIELD, message: error }]}
        formError={shownFormError}
      />
      <GridRow>
        <GridColumn width="two-thirds">
          {/* A plain form posting back to its own page, so it works without JavaScript. */}
          <form method="post" encType="multipart/form-data" onSubmit={submit}>
            <div
              className={`govuk-form-group${error === undefined ? '' : ' govuk-form-group--error'}`}
            >
              <h1 className="govuk-label-wrapper">
                <Label classModifiers="xl" htmlFor={inputId}>
                  {UPLOAD_HEADING}
                </Label>
              </h1>
              {error === undefined ? null : <ErrorMessage id={ERROR_ID}>{error}</ErrorMessage>}
              <Input
                accept=".csv"
                aria-describedby={error === undefined ? undefined : ERROR_ID}
                classBlock="govuk-file-upload"
                classModifiers={error === undefined ? [] : 'error'}
                id={inputId}
                name={FIELD}
                type="file"
              />
            </div>
            <Button type="submit">Continue</Button>
            <p className="govuk-body" role="status">
              {uploading ? UPLOADING : null}
            </p>
          </form>
        </GridColumn>
      </GridRow>
    </>
  );
}

export const PROBLEMS_HEADING = 'There is a problem with the indicator data table you uploaded';

export function DataTableProblemsPage({
  id,
  problems,
}: {
  id: string;
  problems: readonly DataTableProblem[];
}) {
  return (
    <GridRow>
      <GridColumn width="two-thirds">
        <h1 className="govuk-heading-xl">{PROBLEMS_HEADING}</h1>
        <Table
          headings={{ problem: 'Problem', detail: 'Detail', actions: 'Actions' }}
          keys={['problem', 'detail', 'actions']}
          data={problemRows(problems).map(({ problem, detail, actions }) => ({
            // The first column is a row header, which GOV.UK sets bold; the problems read as
            // plain text, as the design has them.
            problem: <span className="govuk-!-font-weight-regular">{problem}</span>,
            detail,
            actions: (
              <>
                <p className="govuk-body">You should either:</p>
                <ul className="govuk-list govuk-list--bullet">
                  {actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </>
            ),
          }))}
        />
        <Button href={indicatorDataTablePath(id)}>Upload different or corrected data table</Button>
      </GridColumn>
    </GridRow>
  );
}

export const CHECK_HEADING = 'Check the indicator data table';

/**
 * Links for the pages Pagination displays: the first, the last, and those next to the current
 * page. The others are left as gaps in the array, which Pagination skips, so a large table
 * doesn't build a link for every page.
 */
export function pageLinks<Link>(
  totalPages: number,
  current: number,
  link: (page: number) => Link,
): Link[] {
  const links = new Array<Link>(totalPages);
  for (const page of [1, current - 1, current, current + 1, totalPages]) {
    if (page >= 1 && page <= totalPages) links[page - 1] = link(page);
  }
  return links;
}

interface CheckDataTablePageProps extends DataTableCheckData {
  formError?: string | undefined;
}

export function CheckDataTablePage({
  id,
  dataTable,
  totalPages,
  formError,
}: CheckDataTablePageProps) {
  const { page, rowsPerPage, yearType } = dataTable;
  const columns = checkColumns(dataTable.columns);

  // Plain anchors: the router-aware link would also mark every link to the bare path as current.
  const pageLink = (number: number) => ({
    href: indicatorDataTableCheckPath(id, { page: number, rowsPerPage }),
    forceExternal: true,
    ...(number === page ? { 'aria-current': 'page' as const } : {}),
  });

  return (
    <>
      <DocumentTitle hasErrors={formError !== undefined} pageTitle={CHECK_HEADING} />
      <ErrorSummary errors={[]} formError={formError} />
      <GridRow>
        <GridColumn width="full">
          <h1 className="govuk-heading-xl">{CHECK_HEADING}</h1>
          <div className="fphd-table-controls">
            <p className="govuk-body">{uploadSummary(dataTable)}</p>
            {/* Asks for the first page in the new size, without JavaScript too. */}
            <form className="fphd-table-controls__form" method="get">
              <Select
                defaultValue={String(rowsPerPage)}
                label="Rows per page"
                name="rowsPerPage"
                options={DATA_TABLE_ROWS_PER_PAGE.map((value) => ({ value, label: value }))}
              />
              <Button classModifiers="secondary" type="submit">
                Apply
              </Button>
            </form>
          </div>
          {/* No row headers: no one column identifies a row, and suppressed values are empty. */}
          <TableScrollRegion label="Data table">
            <table className="govuk-table">
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  {columns.map(({ key, heading }) => (
                    <th key={key} scope="col" className="govuk-table__header">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {dataTable.rows.map((row) => (
                  <tr
                    key={`${row.areaCode}|${row.fromDate}|${row.toDate}|${row.dimensionKey}`}
                    className="govuk-table__row"
                  >
                    {columns.map(({ key, cell }) => (
                      <td key={key} className="govuk-table__cell">
                        {cell(row, yearType)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollRegion>
          <div className="fphd-table-controls">
            <p className="govuk-body">{rowsShowing(dataTable)}</p>
            {totalPages > 1 ? (
              <Pagination
                currentPage={page}
                landmarkLabel="Data table pages"
                links={pageLinks(totalPages, page, pageLink)}
              />
            ) : null}
          </div>
          <p className="govuk-body govuk-!-font-weight-bold">
            By continuing, you confirm the data table is correct.
          </p>
          <form action={indicatorDataTableCheckPath(id)} method="post">
            <input name="batchId" type="hidden" value={dataTable.batchId} />
            <div className="govuk-button-group">
              <Button type="submit">Continue</Button>
              <Button classModifiers="secondary" href={indicatorDataTablePath(id)}>
                Choose a different data table
              </Button>
            </div>
          </form>
        </GridColumn>
      </GridRow>
    </>
  );
}
