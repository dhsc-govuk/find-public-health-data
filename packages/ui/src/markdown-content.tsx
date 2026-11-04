import type { MarkdownHtml } from './markdown.ts';

interface MarkdownProps {
  /** Rendered by `renderMarkdown` on the server, so nothing else reaches the page as HTML. */
  html: MarkdownHtml;
  className?: string;
}

/** Text a user wrote, as `renderMarkdown` rendered it. */
export function Markdown({ html, className }: MarkdownProps) {
  return (
    <div
      className={className === undefined ? 'fphd-markdown' : `fphd-markdown ${className}`}
      // renderMarkdown escapes raw HTML and refuses unsafe links, so this is its output alone.
      dangerouslySetInnerHTML={{ __html: html.markdownHtml }}
    />
  );
}
