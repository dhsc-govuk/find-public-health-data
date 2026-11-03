// Apart from the loader, so the page reads it without pulling the server's Markdown renderer into
// the client bundle.

/** The reply's form field, which the page names and the action reads. */
export const REVISION_RESPONSE_FIELD = 'revisionResponse';

export type RevisionResponseField = typeof REVISION_RESPONSE_FIELD;
