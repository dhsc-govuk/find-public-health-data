import { describe, expect, it } from 'vitest';

import { type MarkdownHtml, renderMarkdown } from './markdown.ts';

const html = (text: string, size?: 'm' | 's') => renderMarkdown(text, size).markdownHtml;

describe('renderMarkdown', () => {
  it('renders paragraphs, keeping each line break as typed', () => {
    expect(html('First line\nsecond line\n\nNext paragraph')).toBe(
      '<p class="govuk-body">First line<br>\nsecond line</p>\n<p class="govuk-body">Next paragraph</p>',
    );
  });

  it('renders the small body text when asked', () => {
    expect(html('Small', 's')).toBe('<p class="govuk-body-s">Small</p>');
  });

  it('renders bulleted and numbered lists as GOV.UK lists', () => {
    expect(html('- one\n- two')).toBe(
      '<ul class="govuk-body govuk-list govuk-list--bullet">\n<li>one</li>\n<li>two</li>\n</ul>',
    );
    expect(html('1. one\n2. two')).toBe(
      '<ol class="govuk-body govuk-list govuk-list--number">\n<li>one</li>\n<li>two</li>\n</ol>',
    );
  });

  it('renders a link as a GOV.UK link', () => {
    expect(html('See [the guidance](https://www.gov.uk/guidance).')).toBe(
      '<p class="govuk-body">See <a href="https://www.gov.uk/guidance" class="govuk-link">the guidance</a>.</p>',
    );
  });

  it('links a bare address with its scheme, as the prototype does', () => {
    expect(html('See https://www.gov.uk/guidance')).toBe(
      '<p class="govuk-body">See <a href="https://www.gov.uk/guidance" class="govuk-link">https://www.gov.uk/guidance</a></p>',
    );
  });

  it('leaves an address without its scheme, and a bare javascript: one, as text', () => {
    expect(html('Read notes.md or www.gov.uk')).toBe(
      '<p class="govuk-body">Read notes.md or www.gov.uk</p>',
    );
    expect(html('javascript:alert(1)')).toBe('<p class="govuk-body">javascript:alert(1)</p>');
  });

  it('renders a table with GOV.UK table classes', () => {
    expect(html('| Year | Count |\n| --- | --- |\n| 2024 | 12 |')).toBe(
      [
        '<table class="govuk-table">',
        '<thead class="govuk-table__head">',
        '<tr class="govuk-table__row">',
        '<th scope="col" class="govuk-table__header">Year</th>',
        '<th scope="col" class="govuk-table__header">Count</th>',
        '</tr>',
        '</thead>',
        '<tbody class="govuk-table__body">',
        '<tr class="govuk-table__row">',
        '<td class="govuk-table__cell">2024</td>',
        '<td class="govuk-table__cell">12</td>',
        '</tr>',
        '</tbody>',
        '</table>',
      ].join('\n'),
    );
  });

  it('aligns table columns with GOV.UK classes, never a style the CSP would refuse', () => {
    const rendered = html('| Area | Rate | Note |\n| :--- | ---: | :---: |\n| Leeds | 12.5 | ok |');

    expect(rendered).not.toContain('style=');
    expect(rendered).toContain(
      '<th scope="col" class="govuk-table__header govuk-!-text-align-left">Area</th>',
    );
    expect(rendered).toContain('<td class="govuk-table__cell govuk-!-text-align-right">12.5</td>');
    expect(rendered).toContain('<td class="govuk-table__cell govuk-!-text-align-centre">ok</td>');
  });

  it('renders superscript and subscript, leaving strikethrough as it was', () => {
    expect(html('per km^2^ of NO~2~, ~~not this~~')).toBe(
      '<p class="govuk-body">per km<sup>2</sup> of NO<sub>2</sub>, <s>not this</s></p>',
    );
  });

  it('escapes raw HTML, so no script or event handler reaches the page', () => {
    const rendered = html('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">');

    expect(rendered).toBe(
      '<p class="govuk-body">&lt;script&gt;alert(1)&lt;/script&gt;</p>\n' +
        '<p class="govuk-body">&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;</p>',
    );
    expect(rendered).not.toMatch(/<script|<img/);
  });

  it('refuses a javascript: link, leaving its text as typed', () => {
    const rendered = html('[click me](javascript:alert(1))');

    expect(rendered).not.toContain('<a');
    expect(rendered).toBe('<p class="govuk-body">[click me](javascript:alert(1))</p>');
  });

  it('leaves a fenced block and a quotation as paragraphs', () => {
    expect(html('```\nx = 1\n```')).not.toContain('<pre');
    expect(html('> quoted')).toBe('<p class="govuk-body">&gt; quoted</p>');
  });

  it('leaves headings, rules, images and indented lines as text', () => {
    expect(html('# Not a heading')).toBe('<p class="govuk-body"># Not a heading</p>');
    expect(html('Text\n\n---')).toBe(
      '<p class="govuk-body">Text</p>\n<p class="govuk-body">---</p>',
    );
    expect(html('![a pixel](https://example.com/p.png)')).not.toContain('<img');
    expect(html('    indented')).toBe('<p class="govuk-body">indented</p>');
  });

  it('is the only maker of rendered Markdown', () => {
    // @ts-expect-error a plain object is not rendered Markdown
    const forged: MarkdownHtml = { markdownHtml: '<script>alert(1)</script>' };

    expect(forged.markdownHtml).toContain('script');
  });
});
