import { A } from '@fphd/ui';

import { GuidanceTable } from './guidance-table.tsx';

export function SentenceLength() {
  return (
    <>
      <p className="govuk-body">You should:</p>
      <ul className="govuk-list govuk-list--bullet">
        <li>split up long sentences</li>
        <li>keep sentences short, up to a maximum of 20 words</li>
        <li>vary your sentence lengths – it helps make content easier to read</li>
        <li>have no more than 5 sentences in a paragraph</li>
      </ul>
    </>
  );
}

export function TechnicalTerms() {
  return (
    <>
      <p className="govuk-body">
        As much as possible, you should avoid using technical terms and acronyms. However, they are
        often unavoidable or can help make content more concise.
      </p>
      <p className="govuk-body">
        You should always define a technical term or acronym the first time you use it in a piece of
        content. Unless it’s an acronym that is better known than its long-form name, such as ‘NHS’.
        For example, ‘sexually transmitted infection (STI)’ and then using just ‘STI’ for any
        further uses.
      </p>
      <p className="govuk-body">You do not need to use full stops in acronyms.</p>
    </>
  );
}

/** Each word or phrase to avoid, and its simpler alternatives. */
const PLAIN_LANGUAGE: readonly (readonly [string, string])[] = [
  ['Assistance', 'Help'],
  ['Approximately', 'About'],
  ['Collaborate', 'Work with'],
  ['Combat', 'Solve, fix'],
  ['Disincentivise', 'Discourage, put people off'],
  ['Driving', 'Leading'],
  ['Empower', 'Help, support, give confidence to'],
  ['Facilitate', 'Run, allow'],
  ['Foster', 'Build'],
  ['He or she', 'They'],
  ['Incentivise', 'Encourage'],
  ['In order to', 'To'],
  ['Initiate', 'Start'],
  ['Innovative', 'New, unique'],
  ['Leverage', 'Use'],
  ['Liaise', 'Work with, speak to'],
  ['Optimised', 'Improved'],
  ['Robust', 'Well thought out, comprehensive'],
  ['Utilise', 'Use'],
  ['Streamline', 'Simplify, improve'],
  ['Tackling', 'Dealing with, solving, removing'],
];

export function PlainLanguage() {
  return (
    <GuidanceTable
      headings={['Word or phrase to avoid', 'Simpler alternatives']}
      labelledBy="plain-language"
      rows={PLAIN_LANGUAGE.map(([avoid, alternatives]) => ({
        header: avoid,
        cells: [alternatives],
      }))}
    />
  );
}

export function Vocabulary() {
  return (
    <>
      <h4 className="govuk-heading-s">Ages</h4>
      <p className="govuk-body">Write ages and age ranges in the following formats:</p>
      <ul className="govuk-list govuk-list--bullet">
        <li>14 years old</li>
        <li>aged 14 to 25 years</li>
        <li>aged 25 years and over</li>
      </ul>

      <h4 className="govuk-heading-s">Ampersands</h4>
      <p className="govuk-body">
        Use ‘and’ rather than an ‘&amp;’, unless it’s part of a brand or organisation name.
      </p>

      <h4 className="govuk-heading-s">And/or</h4>
      <p className="govuk-body">Use ‘and’ or ‘or’, depending on which is more appropriate.</p>

      <h4 className="govuk-heading-s">Capitalisation</h4>
      <p className="govuk-body">
        You should only capitalise things that are proper nouns, such as names of organisations or
        government acts. For example, ‘Cabinet Office’ or ‘Homelessness Reduction Act’.
      </p>

      <h4 className="govuk-heading-s">Contractions</h4>
      <p className="govuk-body">
        You should avoid using contractions like ‘should’ve’, ‘could’ve’ and ‘would’ve’. They can be
        hard to read.
      </p>
      <p className="govuk-body">
        Also avoid negative contractions, such as ‘don’t’ and ‘can’t’. There is strong evidence some
        people misread these.
      </p>

      <h4 className="govuk-heading-s">Coronavirus (COVID-19)</h4>
      <p className="govuk-body">
        Use ‘coronavirus (COVID-19)’ in the text at first mention, then ‘COVID-19’ after that.
      </p>

      <h4 className="govuk-heading-s">‘Data’ and ‘data set’</h4>
      <p className="govuk-body">
        Treat ‘data’ as a singular noun, as in “the data is collected…”. Use ‘data set’ not
        ‘dataset’.
      </p>

      <h4 className="govuk-heading-s">Dates</h4>
      <p className="govuk-body">
        Write dates in full, without using suffixes after numbers. Use ‘to’ instead of hyphens.
        Example dates and date ranges:
      </p>
      <ul className="govuk-list govuk-list--bullet">
        <li>Saturday 14 September 2026</li>
        <li>14 to 28 September 2026</li>
        <li>July to September 2026</li>
        <li>July 2025 to September 2026</li>
        <li>Between 2018 to 2019 and 2022 to 2023</li>
      </ul>

      <h4 className="govuk-heading-s">eg, etc, ie</h4>
      <p className="govuk-body">
        These are not always understood and can be misread by screen reading tools.
      </p>
      <p className="govuk-body">
        Instead of using ‘eg’ and ‘etc’, start sentences with words like ‘for example’, ‘such as’,
        ‘like’ or ‘including’.
      </p>
      <p className="govuk-body">
        Instead of using ‘ie’, try writing sentences in a way that avoids the need. Or use an
        alternative like ‘meaning’ or ‘that is’.
      </p>

      <h4 className="govuk-heading-s">Hyphens</h4>
      <p className="govuk-body">Only use hyphens:</p>
      <ul className="govuk-list govuk-list--bullet">
        <li>for short compound adjectives, such as ‘3-year programme’</li>
        <li>to avoid ambiguity, such as ‘a data-focused approach’ not ‘a data focused approach’</li>
        <li>for common adverbs, such as ‘well-established’</li>
      </ul>

      <h4 className="govuk-heading-s">Numbers</h4>
      <p className="govuk-body">You should use:</p>
      <ul className="govuk-list govuk-list--bullet">
        <li>numerals for all numbers</li>
        <li>a comma to separate thousands, such as ‘9,000’</li>
        <li>‘to’ for ranges, such as ‘500 to 600’</li>
        <li>a ‘0’ before decimal amounts below one, such as ‘0.4’</li>
        <li>‘million’ not ‘m’, for example ‘£138 million’</li>
      </ul>
      <p className="govuk-body">
        Spell out any measurements that could be unclear. For example, ‘m’ could be ‘metres’,
        ‘minutes’ or ‘months’.
      </p>

      <h4 className="govuk-heading-s">Semicolons</h4>
      <p className="govuk-body">
        Avoid using these. Break up long sentences into separate sentences instead.
      </p>

      <h4 className="govuk-heading-s">Times of the day</h4>
      <p className="govuk-body">You should:</p>
      <ul className="govuk-list govuk-list--bullet">
        <li>use the 12-hour clock</li>
        <li>use a colon to separate hours and minutes</li>
        <li>do not use minutes for times on the hour</li>
        <li>do not put a space before ‘am’ or ‘pm’</li>
      </ul>
      <p className="govuk-body">For example, “3:30pm”, “11am to 3pm”</p>
    </>
  );
}

/** Markdown as a publisher types it, one line of the sample to a line. */
function MarkdownSample({ lines }: { lines: readonly string[] }) {
  return lines.map((line, index) => (
    <span key={line}>
      {index === 0 ? null : <br />}
      <code className="fphd-code">{line}</code>
    </span>
  ));
}

export function MarkdownGuidance() {
  return (
    <>
      <p className="govuk-body">
        All free text fields in the service accept markdown styling, but not html. This allows you
        to use things like inline links and bullet lists, and provides a consistent approach and
        look for consumers. This helps limit the chance of styling and legibility issues for
        consumers.
      </p>
      <GuidanceTable
        headings={['Feature', 'Markdown', 'How it looks', 'Advice']}
        labelledBy="markdown"
        variant="markdown"
        rows={[
          {
            header: 'Inline links',
            cells: [
              <MarkdownSample lines={['[Link text](full link URL)']} />,
              <A href="https://www.gov.uk/">Link text</A>,
              <>
                <p className="govuk-body">When writing link text:</p>
                <ul className="govuk-list govuk-list--bullet">
                  <li>make it clear what the user will be getting from the link</li>
                  <li>avoid using full web addresses</li>
                  <li>ensure it makes sense in the sentence the link is in</li>
                  <li>avoid directions such as ‘click here’ or ‘find out more’</li>
                  <li>use a few words rather than just one</li>
                </ul>
              </>,
            ],
          },
          {
            header: 'Bulleted list',
            cells: [
              <MarkdownSample lines={['* bullet 1', '* bullet 2', '* bullet 3']} />,
              <ul className="govuk-list govuk-list--bullet">
                <li>bullet 1</li>
                <li>bullet 2</li>
                <li>bullet 3</li>
              </ul>,
              <>
                <p className="govuk-body">Bullet lists should:</p>
                <ul className="govuk-list govuk-list--bullet">
                  <li>only be used if necessary</li>
                  <li>keep to one sentence per bullet</li>
                  <li>not end with punctuation or words like ‘or’</li>
                  <li>
                    ideally have a lead-in line that makes a full sentence with each bullet – like
                    each of the bullets in this list
                  </li>
                  <li>start with lowercase letters when there is a lead-in line</li>
                </ul>
              </>,
            ],
          },
          {
            header: 'Numbered list',
            cells: [
              <MarkdownSample lines={['1. first point', '2. second point', '3. third point']} />,
              <ol className="govuk-list govuk-list--number">
                <li>first point</li>
                <li>second point</li>
                <li>third point</li>
              </ol>,
              <p className="govuk-body">Same advice as with bulleted lists</p>,
            ],
          },
          {
            header: 'Superscript',
            cells: [
              <MarkdownSample lines={['m^3^']} />,
              <>
                m<sup>3</sup>
              </>,
              <ul className="govuk-list govuk-list--bullet">
                <li>
                  Mainly used for units, such as mg/m<sup>3</sup>
                </li>
                <li>
                  Can be used for footnotes, but footnotes should only be used if absolutely
                  necessary
                </li>
              </ul>,
            ],
          },
          {
            header: 'Subscript',
            cells: [
              <MarkdownSample lines={['NO~2~']} />,
              <>
                NO<sub>2</sub>
              </>,
              null,
            ],
          },
        ]}
      />
    </>
  );
}
