// No React here, so a loader renders Markdown on the server and the client bundle never carries it.
import markdownIt, { type MarkdownIt, type StateCore, type Token } from 'markdown-it';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';

declare const RENDERED: unique symbol;

/**
 * Markdown rendered by `renderMarkdown`, the only HTML the `Markdown` component will show. The
 * brand exists only in the type, so nothing but `renderMarkdown` can make one.
 */
export interface MarkdownHtml {
  readonly markdownHtml: string;
  readonly [RENDERED]: true;
}

/** The text size the Markdown sits among: body text, or the small body text. */
export type MarkdownSize = 'm' | 's';

const BODY_CLASS: Readonly<Record<MarkdownSize, string>> = { m: 'govuk-body', s: 'govuk-body-s' };

// GOV.UK Frontend styles nothing bare, so each element takes the class the design system gives it.
function classesFor(token: Token, size: MarkdownSize): string | undefined {
  switch (token.type) {
    case 'paragraph_open':
      return BODY_CLASS[size];
    case 'bullet_list_open':
      return `${BODY_CLASS[size]} govuk-list govuk-list--bullet`;
    case 'ordered_list_open':
      return `${BODY_CLASS[size]} govuk-list govuk-list--number`;
    case 'link_open':
      return 'govuk-link';
    case 'table_open':
      return 'govuk-table';
    case 'thead_open':
      return 'govuk-table__head';
    case 'tbody_open':
      return 'govuk-table__body';
    case 'tr_open':
      return 'govuk-table__row';
    case 'th_open':
      return 'govuk-table__header';
    case 'td_open':
      return 'govuk-table__cell';
    default:
      return undefined;
  }
}

const ALIGNMENTS: Readonly<Record<string, string>> = {
  'text-align:left': 'govuk-!-text-align-left',
  'text-align:center': 'govuk-!-text-align-centre',
  'text-align:right': 'govuk-!-text-align-right',
};

// A table column's alignment comes as a style attribute, which the CSP refuses, so it becomes the
// GOV.UK override class instead. A header cell heads its column.
function tableCellAttributes(token: Token): string | undefined {
  if (token.type === 'th_open') token.attrSet('scope', 'col');
  const style = token.attrGet('style');
  if (style === null) return undefined;
  token.attrs = (token.attrs ?? []).filter(([name]) => name !== 'style');
  return ALIGNMENTS[style];
}

function addClasses(tokens: readonly Token[], size: MarkdownSize): void {
  for (const token of tokens) {
    const alignment =
      token.type === 'th_open' || token.type === 'td_open' ? tableCellAttributes(token) : undefined;
    for (const classes of [classesFor(token, size), alignment]) {
      if (classes !== undefined) token.attrJoin('class', classes);
    }
    if (token.children !== null) addClasses(token.children, size);
  }
}

function markdownFor(size: MarkdownSize): MarkdownIt {
  // Raw HTML stays escaped and the default link check refuses javascript: and the like. Line
  // breaks are kept as typed, and a bare address with its scheme becomes a link, as in the
  // prototype; one without, such as a file named notes.md, stays text.
  const md = markdownIt({ html: false, breaks: true, linkify: true, typographer: false })
    .use(sup)
    .use(sub)
    // Headings and rules would break the page's own outline, images would load from anywhere,
    // and indented, fenced or quoted lines in plain prose are not meant as code or quotation.
    .disable(['heading', 'lheading', 'hr', 'image', 'code', 'fence', 'blockquote']);
  md.linkify.set({ fuzzyLink: false, fuzzyEmail: false });

  md.core.ruler.push('govuk_classes', (state: StateCore) => {
    addClasses(state.tokens, size);
  });
  return md;
}

const RENDERERS: Readonly<Record<MarkdownSize, MarkdownIt>> = {
  m: markdownFor('m'),
  s: markdownFor('s'),
};

/**
 * Renders text a user wrote as Markdown, with GOV.UK classes at the size of the text around it:
 * paragraphs and line breaks, lists, links, tables, emphasis, ^superscript^ and ~subscript~.
 */
export function renderMarkdown(text: string, size: MarkdownSize = 'm'): MarkdownHtml {
  return { markdownHtml: RENDERERS[size].render(text).trim() } as MarkdownHtml;
}
