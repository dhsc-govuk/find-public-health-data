import { Button, Details } from '@fphd/ui';
import { useEffect, useId, useState } from 'react';
import { useLocation } from 'react-router';

export function DownloadShareData({
  href,
  allDataHref,
  metadataHref,
  inline = false,
  downloadLabel,
  allDataLabel,
}: {
  /** The download of the data shown, left out when nothing is shown. */
  href?: string | undefined;
  allDataHref?: string | undefined;
  metadataHref?: string | undefined;
  inline?: boolean;
  downloadLabel?: string | undefined;
  allDataLabel?: string | undefined;
}) {
  const [message, setMessage] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const location = useLocation();
  const inputId = useId();
  useEffect(() => {
    setPageUrl(window.location.href);
  }, [location]);
  const copy = () => {
    if (!navigator.clipboard) {
      setMessage('Copy the page address from your browser to share this view.');
      return;
    }
    void navigator.clipboard.writeText(window.location.href).then(
      () => setMessage('Link copied'),
      () => setMessage('Copy the page address from your browser to share this view.'),
    );
  };
  return (
    <Details
      summary="Download or share data"
      className={
        inline
          ? 'fphd-inline-download govuk-!-margin-bottom-4'
          : 'fphd-topic-download govuk-!-margin-bottom-0'
      }
    >
      {inline ? (
        <div className="fphd-share-link">
          <label className="govuk-label govuk-body-s" htmlFor={inputId}>
            Share this webpage:
          </label>
          <div className="fphd-share-link__controls">
            <input id={inputId} className="govuk-input" readOnly value={pageUrl} />
            <button type="button" className="fphd-share-link__copy govuk-link" onClick={copy}>
              Copy link
            </button>
          </div>
        </div>
      ) : null}
      {href ? (
        <p className="govuk-body-s">
          <a className="govuk-link" href={href}>
            {downloadLabel ??
              (inline ? "Download data for the areas you've chosen (CSV)" : 'Download this table')}
          </a>
          {inline ? null : ' as CSV.'}
        </p>
      ) : null}
      {allDataHref ? (
        <p className="govuk-body-s">
          <a className="govuk-link" href={allDataHref}>
            {allDataLabel ??
              (inline
                ? 'Download data for all areas (CSV)'
                : 'Download all data for this indicator')}
          </a>
          {inline ? null : ' as CSV.'}
        </p>
      ) : null}
      {metadataHref ? (
        <p className="govuk-body-s">
          <a className="govuk-link" href={metadataHref}>
            Download metadata about this indicator (TXT)
          </a>
        </p>
      ) : null}
      {!inline ? (
        <>
          <p className="govuk-body-s">
            Share this page to keep the selected tab, filters, sort order and page.
          </p>
          <Button
            className="fphd-topic-copy govuk-button--secondary govuk-!-margin-bottom-0"
            type="button"
            onClick={copy}
          >
            Copy link to this view
          </Button>
        </>
      ) : null}
      <p role="status" className="govuk-body-s govuk-!-margin-bottom-0">
        {message}
      </p>
      <noscript>
        <p className="govuk-body-s">Copy the page address from your browser to share this view.</p>
      </noscript>
    </Details>
  );
}
