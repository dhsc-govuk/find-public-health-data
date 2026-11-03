import { describe, expect, it } from 'vitest';

import { renderMarkdown } from './markdown.ts';

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

  it('leaves a bare address as text', () => {
    expect(html('https://www.gov.uk')).toBe('<p class="govuk-body">https://www.gov.uk</p>');
  });

  it('renders a table with GOV.UK table classes', () => {
    expect(html('| Year | Count |\n| --- | --- |\n| 2024 | 12 |')).toBe(
      [
        '<table class="govuk-table">',
        '<thead class="govuk-table__head">',
        '<tr class="govuk-table__row">',
        '<th class="govuk-table__header">Year</th>',
        '<th class="govuk-table__header">Count</th>',
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

  it('leaves headings, rules, images and indented lines as text', () => {
    expect(html('# Not a heading')).toBe('<p class="govuk-body"># Not a heading</p>');
    expect(html('Text\n\n---')).toBe(
      '<p class="govuk-body">Text</p>\n<p class="govuk-body">---</p>',
    );
    expect(html('![a pixel](https://example.com/p.png)')).not.toContain('<img');
    expect(html('    indented')).toBe('<p class="govuk-body">indented</p>');
  });
});
